/**
 * Downscales and re-encodes an admin-selected image before it is uploaded.
 *
 * Why this exists: Supabase Storage serves the stored object byte-for-byte —
 * image transformations are not enabled on this project
 * (`/render/image/...` answers `FeatureNotEnabled`), so there is no resizing
 * layer between the bucket and the browser. Whatever is uploaded is exactly
 * what every storefront visitor downloads.
 *
 * That made straight-from-camera uploads the single worst asset on the site: a
 * 7008x4672 / 9.7MB JPEG was being fetched in full to fill a product card that
 * renders 174-322 CSS px wide. The seeded catalogue serves 7-26KB at the same
 * size, so an uploaded image cost ~400x more bytes than a built-in one. It also
 * looked *worse*: a 32MP image needs ~131MB of decoded bitmap, past the budget
 * mobile browsers allow, so they fall back to a subsampled decode — which is
 * why an upload could appear blurrier on the phone than the original file.
 *
 * Capping the long edge fixes both at the only point we control, and does it
 * once per upload rather than on every page view.
 *
 * Deliberately dependency-free: `createImageBitmap` + `<canvas>` are native, so
 * this adds nothing to the storefront bundle. Nothing here runs during SSR —
 * it is only ever reached from a file-picker change handler.
 */

/**
 * Longest edge kept on an upload.
 *
 * Sized from the real layouts, not guessed. The largest an uploaded image is
 * ever drawn is the product detail hero at 560 CSS px (`IMAGE_SIZES.productDetail`);
 * at DPR 3 that is 1680px. 2048 clears it with headroom, and also covers the
 * 1376px hero frames. Product and accessory cards need at most 322 x 3 = 966px.
 *
 * Images already inside this box are never scaled up — upscaling invents detail
 * and only costs bytes.
 */
export const MAX_UPLOAD_EDGE = 2048;

/** WebP quality. At 0.9 the result is visually indistinguishable at these sizes. */
export const REENCODE_QUALITY = 0.9;

/**
 * An image small enough in both pixels and bytes is passed through untouched.
 *
 * Re-encoding an already-lean file is a second lossy generation for no
 * meaningful saving, so a hand-optimised 130KB WebP is left exactly as the
 * admin exported it.
 */
export const PASSTHROUGH_BYTES = 600 * 1024;

/**
 * Formats that must never be rasterised.
 *
 * SVG is vector — redrawing it to a canvas would freeze it at one resolution
 * and throw away the reason to use it. GIF may be animated, and a canvas keeps
 * only the first frame. Both are small by nature, so there is nothing to win.
 */
const PASS_THROUGH_TYPES = new Set(["image/svg+xml", "image/gif"]);
const PASS_THROUGH_EXTENSIONS = [".svg", ".gif"];

export interface Fitted {
  width: number;
  height: number;
  /** Whether the box is smaller than the source, i.e. a real downscale. */
  resized: boolean;
}

/**
 * The box an image of `width` x `height` is drawn into, capped at `maxEdge`.
 *
 * Pure and exported so the sizing rules can be tested without a browser. Aspect
 * ratio is preserved exactly — the image is never stretched — and each side is
 * floored to a whole pixel with a 1px minimum so a very wide panorama cannot
 * round its short edge to zero.
 */
export function fitWithin(width: number, height: number, maxEdge = MAX_UPLOAD_EDGE): Fitted {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return { width, height, resized: false };
  if (longest <= maxEdge) return { width, height, resized: false };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    resized: true,
  };
}

/** Whether `file` is a format this module refuses to touch. */
export function isPassThrough(file: File): boolean {
  if (PASS_THROUGH_TYPES.has(file.type)) return true;
  const name = file.name.toLowerCase();
  return PASS_THROUGH_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Whether a file of these dimensions and this size is already fine as-is.
 *
 * Both conditions have to hold: a 1376x768 PNG is within the pixel box but can
 * still be 1.4MB, and re-encoding that to WebP is a ~10x saving worth taking.
 */
export function needsWork(fitted: Fitted, bytes: number): boolean {
  return fitted.resized || bytes > PASSTHROUGH_BYTES;
}

/** Swaps a filename's extension for `.webp`, keeping the admin's own stem. */
export function toWebpName(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, "");
  return `${stem || "image"}.webp`;
}

function canUseCanvas(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof createImageBitmap === "function" &&
    typeof HTMLCanvasElement !== "undefined"
  );
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Draws `bitmap` into a `target`-sized canvas.
 *
 * A single `drawImage` from 7008px straight down to 2048px makes the browser
 * pick a cheap filter, which is visibly soft — exactly the complaint this is
 * meant to remove. Halving repeatedly until within 2x of the target keeps every
 * step in the range where the smoothing filter is accurate, then the last step
 * lands on the exact size. This is the standard trade: a few extra draws at
 * upload time for a sharp result on every page view afterwards.
 */
function drawDownscaled(bitmap: ImageBitmap, target: Fitted): HTMLCanvasElement {
  let source: ImageBitmap | HTMLCanvasElement = bitmap;
  let w = bitmap.width;
  let h = bitmap.height;

  while (w > target.width * 2 && h > target.height * 2) {
    const half = document.createElement("canvas");
    half.width = Math.max(target.width, Math.floor(w / 2));
    half.height = Math.max(target.height, Math.floor(h / 2));
    const hctx = half.getContext("2d");
    if (!hctx) break;
    hctx.imageSmoothingEnabled = true;
    hctx.imageSmoothingQuality = "high";
    hctx.drawImage(source, 0, 0, half.width, half.height);
    source = half;
    w = half.width;
    h = half.height;
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/**
 * Returns the file to actually upload: either a downscaled WebP, or the
 * original untouched.
 *
 * Never throws and never blocks an upload. Every failure path — an unsupported
 * browser, a decode error, a format that must not be rasterised, a re-encode
 * that came out no smaller — returns the original file, so the worst case is
 * the behaviour that shipped before this existed.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (isPassThrough(file) || !canUseCanvas()) return file;

  let bitmap: ImageBitmap;
  try {
    // `from-image` bakes in EXIF rotation. Without it a phone photo that the
    // browser displays upright would be re-encoded sideways, because the
    // orientation tag does not survive the canvas.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const fitted = fitWithin(bitmap.width, bitmap.height);
    if (!needsWork(fitted, file.size)) return file;

    const canvas = drawDownscaled(bitmap, fitted);
    const blob = await toBlob(canvas, "image/webp", REENCODE_QUALITY);

    // A re-encode that saved nothing is not worth a second lossy generation.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], toWebpName(file.name), {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
