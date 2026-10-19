import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { AppError, BadRequestError } from "./errors.js";

/**
 * Catalogue image uploads, backed by a public Supabase Storage bucket.
 *
 * The admin panel posts the raw file bytes; the returned public URL is what
 * gets stored on the product or accessory. Only the formats the storefront
 * renders are accepted, and each is verified by magic bytes rather than
 * trusting the browser-supplied Content-Type.
 *
 * Accessories share this bucket rather than provisioning a second one: the
 * objects are named by UUID, so there is no collision, and there is one place
 * to configure and one set of storage credentials.
 */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/**
 * Upload cap. The Storage bucket is configured with the same limit, so the two
 * cannot drift apart and reject at different sizes.
 *
 * 15 MB comfortably covers high-resolution product photography straight off a
 * camera while still bounding what a single request can buffer.
 */
export const MAX_IMAGE_MB = 15;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

/** Content types the storefront can render, mapped to their file extension. */
export const SUPPORTED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
} as const;

export type SupportedImageType = keyof typeof SUPPORTED_IMAGE_TYPES;

export function isSupportedImageType(value: string): value is SupportedImageType {
  return value in SUPPORTED_IMAGE_TYPES;
}

/** Human-readable format list, so error messages track the map above. */
export const SUPPORTED_IMAGE_LABEL = "JPG, JPEG, PNG, WEBP, GIF, AVIF or SVG";

/**
 * Content-Types the upload route will buffer. The octet-stream fallback lets a
 * file the browser could not classify (no extension, or an unfamiliar one)
 * still reach the sniffer instead of being turned away by the body parser.
 */
export const UPLOAD_CONTENT_TYPES = [
  ...Object.keys(SUPPORTED_IMAGE_TYPES),
  "application/octet-stream",
];

/**
 * Browsers derive `file.type` from the filename extension, so a PNG saved as
 * `photo.jpg` is announced as image/jpeg. Sniffing the leading bytes is the
 * only reliable way to know what was actually uploaded.
 *
 * `.jpg` and `.jpeg` share one JPEG signature, so both land here as image/jpeg.
 */
function detectImageType(bytes: Buffer): SupportedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  // GIF87a / GIF89a.
  if (bytes.length >= 6 && bytes.subarray(0, 3).toString("ascii") === "GIF") {
    const version = bytes.subarray(3, 6).toString("ascii");
    if (version === "87a" || version === "89a") return "image/gif";
  }
  // RIFF container; the WEBP tag sits after the 4-byte length field.
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  // ISO base media container. AVIF declares itself in the major brand or in
  // the compatible-brand list that follows it inside the ftyp box.
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const boxSize = bytes.readUInt32BE(0);
    const ftyp = bytes.subarray(8, Math.min(Math.max(boxSize, 16), bytes.length)).toString("ascii");
    if (/avif|avis/.test(ftyp)) return "image/avif";
  }
  if (looksLikeSvg(bytes)) return "image/svg+xml";
  return null;
}

/**
 * SVG is text, not a binary format with magic bytes, so it is sniffed by
 * looking for a root <svg> element past any BOM, XML declaration, doctype or
 * comment. Only the head of the file is examined — enough to classify it
 * without reading megabytes of path data.
 */
function looksLikeSvg(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 1024).toString("utf8").replace(/^﻿/, "").trimStart();
  if (!head.startsWith("<")) return false;
  return /<svg[\s>]/i.test(head);
}

/**
 * SVGs are the one upload format that can carry executable content. They are
 * served from the Storage domain and only ever rendered through <img>, where
 * scripts do not run — but a direct visit to the object URL would execute
 * them, so anything scriptable is refused rather than stored.
 */
function assertSvgIsInert(bytes: Buffer): void {
  const text = bytes.toString("utf8");
  const scriptable =
    /<script[\s>]/i.test(text) ||
    /<foreignObject[\s>]/i.test(text) ||
    /\son\w+\s*=/i.test(text) ||
    /(?:href|xlink:href)\s*=\s*["'\s]*javascript:/i.test(text);
  if (scriptable) {
    throw new BadRequestError(
      "This SVG contains scripts or event handlers and cannot be uploaded. Export a plain (flattened) SVG and try again.",
    );
  }
}

/**
 * Stores one catalogue image and returns its public URL.
 *
 * @param bytes    Raw file contents.
 * @param declared Content-Type sent by the browser. Advisory only and
 *                 deliberately not enforced: it is derived from the filename
 *                 extension, so a PNG named .jpg announces itself as
 *                 image/jpeg. The sniffed type decides the stored extension
 *                 and the Content-Type sent to Storage.
 * @param bucket   Storage bucket to write into.
 */
export async function uploadCatalogImage(
  bytes: Buffer,
  declared: string,
  bucket: string = PRODUCT_IMAGE_BUCKET,
): Promise<string> {
  if (bytes.length === 0) throw new BadRequestError("The uploaded file is empty");
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new AppError(`Image must be ${MAX_IMAGE_MB} MB or smaller`, 413);
  }

  const actual = detectImageType(bytes);
  if (!actual) {
    throw new BadRequestError(`Unsupported image format. Use ${SUPPORTED_IMAGE_LABEL}.`);
  }
  if (actual === "image/svg+xml") assertSvgIsInert(bytes);

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new AppError(
      "Image uploads are not configured: set SUPABASE_SERVICE_ROLE_KEY in backend/.env",
      503,
    );
  }

  const objectPath = `${randomUUID()}.${SUPPORTED_IMAGE_TYPES[actual]}`;
  const endpoint = `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "content-type": actual,
      "cache-control": "public, max-age=31536000, immutable",
    },
    body: new Uint8Array(bytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // The key itself must never reach the client or the logs.
    throw new AppError(
      `Storage upload failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      502,
    );
  }

  return `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
}

/** Stores one product image. */
export function uploadProductImage(bytes: Buffer, declared: string): Promise<string> {
  return uploadCatalogImage(bytes, declared, PRODUCT_IMAGE_BUCKET);
}

/** Stores one accessory image, in the same bucket as product images. */
export function uploadAccessoryImage(bytes: Buffer, declared: string): Promise<string> {
  return uploadCatalogImage(bytes, declared, PRODUCT_IMAGE_BUCKET);
}
