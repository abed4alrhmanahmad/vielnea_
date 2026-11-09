import { PUBLIC_API_BASE_URL } from "@/lib/api/client";

/**
 * Resized WebP copies of admin-uploaded images, served by the backend's
 * `/api/img/<width>/<project-ref>/<object>` route (backend lib/image-resize.ts).
 *
 * Supabase Storage serves uploads byte-for-byte, so without this a phone
 * downloaded each original in full — up to 1.4MB for a 160px product card.
 * The original URL stays as the `<img src>`, and the route answers anything it
 * can't resize with a redirect to that original, so an image never breaks.
 */

/** Must match IMAGE_WIDTHS in the backend's lib/image-resize.ts. */
const REMOTE_IMAGE_WIDTHS = [256, 384, 576, 768, 1024, 1536] as const;

/** Public objects of the catalogue bucket; raster formats only (not SVG/GIF). */
const SUPABASE_CATALOG_IMAGE =
  /^https:\/\/([a-z0-9]+)\.supabase\.co\/storage\/v1\/object\/public\/product-images\/([A-Za-z0-9_-]+\.(?:jpe?g|png|webp|avif))$/i;

/** A `srcSet` of resized copies for an uploaded image, or undefined for any other URL. */
export function remoteImageSrcSet(src: string): string | undefined {
  const match = SUPABASE_CATALOG_IMAGE.exec(src);
  if (!match) return undefined;
  const [, ref, object] = match;
  return REMOTE_IMAGE_WIDTHS.map((w) => `${PUBLIC_API_BASE_URL}/img/${w}/${ref}/${object} ${w}w`).join(
    ", ",
  );
}
