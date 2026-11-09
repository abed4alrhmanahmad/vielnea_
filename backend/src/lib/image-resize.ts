import os from "node:os";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { Request, Response } from "express";
import sharp from "sharp";
import { env } from "../config/env.js";
import { PRODUCT_IMAGE_BUCKET } from "./storage.js";

/**
 * Width-limited WebP copies of uploaded catalogue images.
 *
 * Supabase Storage serves uploads byte-for-byte (image transformations are not
 * enabled on this project: `/render/image/...` answers 403), so a product card
 * drawn 160px wide on a phone downloaded the whole original — up to 1.4MB on
 * the live homepage. The storefront's `srcSet` points here instead:
 *
 *   GET /api/img/<width>/<project-ref>/<object>   e.g. /api/img/384/abcd…/uuid.jpg
 *
 * Only objects in the public catalogue bucket of this project are fetched, and
 * only at the widths below, so the work any caller can cause is bounded by
 * (real uploads x WIDTHS), each done once. Anything else — another project, a
 * fetch or decode failure — is a 302 to the original public URL, so an image
 * can never break because of this route.
 *
 * Object names are random UUIDs and never rewritten, so a result is cacheable
 * forever: the browser keeps it for a year, and the server keeps it in memory
 * and on local disk (lost on redeploy, rebuilt on first request).
 */

/** Must match REMOTE_IMAGE_WIDTHS in the storefront's lib/remote-image.ts. */
export const IMAGE_WIDTHS: ReadonlySet<number> = new Set([256, 384, 576, 768, 1024, 1536]);

/** WebP quality. Visually indistinguishable from the source at these sizes. */
const QUALITY = 82;

/**
 * Every frame these images fill is `object-cover` and at most 3:4 portrait
 * (cards; the product page is 4:5, thumbnails and tiles square). Resizing to
 * cover a w x 4w/3 box instead of to width w alone keeps a landscape upload
 * sharp: cropped into a portrait frame it is drawn wider than the frame.
 */
const COVER_ASPECT = 4 / 3;

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

interface Variant {
  data: Buffer;
  type: string;
}

/** Raster formats only: SVG is vector and GIF may be animated. */
const OBJECT_NAME = /^[A-Za-z0-9_-]{1,128}\.(?:jpe?g|png|webp|avif)$/i;
const PROJECT_REF = /^[a-z0-9]{1,40}$/;

/** A 15MB upload can be ~50MP; refuse decodes past this to protect the 512MB instance. */
const MAX_INPUT_PIXELS = 60_000_000;
const FETCH_TIMEOUT_MS = 10_000;
const MEMORY_BUDGET_BYTES = 32 * 1024 * 1024;

const ownRef = new URL(env.SUPABASE_URL).hostname.split(".")[0] ?? "";
const diskDir = path.join(os.tmpdir(), "vielinea-img-cache");

// 0.5 vCPU: one libvips thread, no libvips operation cache (we cache outputs).
sharp.concurrency(1);
sharp.cache(false);

/** Insertion-ordered Map as an LRU, bounded by total bytes. */
const memory = new Map<string, Variant>();
let memoryBytes = 0;

function remember(key: string, variant: Variant): void {
  if (memory.has(key)) return;
  memory.set(key, variant);
  memoryBytes += variant.data.length;
  for (const [oldKey, old] of memory) {
    if (memoryBytes <= MEMORY_BUDGET_BYTES) break;
    memory.delete(oldKey);
    memoryBytes -= old.data.length;
  }
}

function recall(key: string): Variant | undefined {
  const data = memory.get(key);
  if (data) {
    memory.delete(key);
    memory.set(key, data);
  }
  return data;
}

/** Resizes run one at a time: concurrent requests queue instead of competing for the CPU. */
let queue: Promise<unknown> = Promise.resolve();
function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

const inflight = new Map<string, Promise<Variant>>();

/**
 * Bounds the work anyone can cause: this route is ahead of the rate limiter, and
 * each uncached object means an upstream download (up to the 15MB upload cap)
 * plus a decode. At most MAX_UPSTREAM run at once; up to MAX_WAITING more wait
 * their turn (a page's worth of images on a first visit); beyond that the
 * request is sent to the original image instead.
 */
const MAX_UPSTREAM = 6;
const MAX_WAITING = 100;
let active = 0;
const waiting: Array<() => void> = [];

class BusyError extends Error {}

async function withUpstreamSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_UPSTREAM) {
    if (waiting.length >= MAX_WAITING) throw new BusyError("too many images in progress");
    // The slot is handed over by whoever finishes, so `active` stays as it is.
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    active += 1;
  }
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

/**
 * Objects that failed recently (missing, corrupt, too large), so a made-up or
 * broken name costs one upstream request a minute rather than one per hit.
 */
const FAILURE_TTL_MS = 60_000;
const MAX_FAILURES = 500;
const failures = new Map<string, number>();

function rememberFailure(key: string): void {
  failures.delete(key);
  failures.set(key, Date.now() + FAILURE_TTL_MS);
  if (failures.size > MAX_FAILURES) failures.delete(failures.keys().next().value!);
}

/**
 * The resized WebP, or the original bytes when resizing would not shrink the
 * image (never a second lossy generation at the same size) or would not save
 * bytes. Disk entries are named by which of the two they hold.
 */
async function produce(sourceUrl: string, width: number, object: string): Promise<Variant> {
  const originalType = CONTENT_TYPES[object.split(".").pop()!.toLowerCase()]!;
  const webpPath = path.join(diskDir, `${width}-${object}.webp`);
  const originalPath = path.join(diskDir, `${width}-${object}.orig`);

  const webpFile = await readFile(webpPath).catch(() => undefined);
  if (webpFile) return { data: webpFile, type: "image/webp" };
  const originalFile = await readFile(originalPath).catch(() => undefined);
  if (originalFile) return { data: originalFile, type: originalType };

  return withUpstreamSlot(() => download(sourceUrl, width, originalType, originalPath, webpPath));
}

async function download(
  sourceUrl: string,
  width: number,
  originalType: string,
  originalPath: string,
  webpPath: string,
): Promise<Variant> {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`source answered ${response.status}`);
  const input = Buffer.from(await response.arrayBuffer());

  const height = Math.round(width * COVER_ASPECT);
  const variant = await serially(async (): Promise<Variant> => {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
    const { autoOrient } = await image.metadata();
    // `fit: outside` scales by max(w/W, h/H); it only shrinks past both.
    if (autoOrient.width <= width || autoOrient.height <= height) {
      return { data: input, type: originalType };
    }
    const output = await image
      // Bakes in EXIF orientation, which the stripped output would otherwise lose.
      .rotate()
      .resize({ width, height, fit: "outside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    return output.length < input.length
      ? { data: output, type: "image/webp" }
      : { data: input, type: originalType };
  });

  // Best effort: a failed write only means the next cold start redoes it.
  const diskPath = variant.data === input ? originalPath : webpPath;
  void mkdir(diskDir, { recursive: true })
    .then(async () => {
      const temp = `${diskPath}.${process.pid}.tmp`;
      await writeFile(temp, variant.data);
      await rename(temp, diskPath);
    })
    .catch(() => undefined);

  return variant;
}

export async function resizedImageHandler(req: Request, res: Response): Promise<void> {
  const rawWidth = String(req.params["width"] ?? "");
  // Plain digits only: Number() would also accept "0x100", " 256 " and "2.56e2".
  const width = /^\d{1,4}$/.test(rawWidth) ? Number(rawWidth) : 0;
  const ref = String(req.params["ref"] ?? "");
  const object = String(req.params["object"] ?? "");

  if (!IMAGE_WIDTHS.has(width) || !PROJECT_REF.test(ref) || !OBJECT_NAME.test(object)) {
    res.status(404).json({ success: false, message: "Not found" });
    return;
  }

  const sourceUrl = `https://${ref}.supabase.co/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${object}`;
  const fallBack = () => {
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, sourceUrl);
  };

  // Not this project's bucket: nothing to fetch on its behalf.
  if (ref !== ownRef) {
    fallBack();
    return;
  }

  const key = `${width}/${object}`;
  let variant = recall(key);
  if (!variant) {
    if ((failures.get(key) ?? 0) > Date.now()) {
      fallBack();
      return;
    }
    let pending = inflight.get(key);
    if (!pending) {
      pending = produce(sourceUrl, width, object).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    try {
      variant = await pending;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Overload is expected during a flood and not worth a log line per request.
      if (!(error instanceof BusyError)) {
        // eslint-disable-next-line no-console
        console.warn(`[img] ${key} served as original: ${message}`);
        rememberFailure(key);
      }
      fallBack();
      return;
    }
    remember(key, variant);
  }

  res.setHeader("Content-Type", variant.type);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Length", String(variant.data.length));
  res.end(variant.data);
}
