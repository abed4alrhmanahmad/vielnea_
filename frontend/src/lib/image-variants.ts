/**
 * Responsive WebP variants that exist on disk for API-served images.
 *
 * Image URLs reach the storefront as API data (`/images/products/...` for the
 * seeded catalogue, absolute Supabase Storage URLs for anything the admin has
 * uploaded). Only the seeded files have pre-built variants, so this map is the
 * guard: a path listed here is known to have the sibling `-<w>.webp` files, and
 * anything absent — every admin upload — falls through to a plain <img> with the
 * original URL, exactly as before. That keeps the optimisation entirely on the
 * frontend: no API response changed, and an unoptimised upload still renders.
 *
 * GENERATED FILE — regenerate rather than hand-edit.
 */
export interface ImageVariants {
  /** Intrinsic size of the original, used for width/height hints. */
  width: number;
  height: number;
  /** Widths for which `<stem>-<w>.webp` exists, ascending. */
  widths: number[];
}

export const IMAGE_VARIANTS: Record<string, ImageVariants> = {
  "/images/products/product-accessories.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-accessory-brooch.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-blazer.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-blazer-card.jpg": {
    width: 1024,
    height: 1280,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-blouse.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-dress.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-handbag.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-jewelry.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-pants.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-shoulderbag.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-skirt.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-top.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/products/product-vest.jpg": {
    width: 1024,
    height: 1024,
    widths: [256, 384, 576, 768, 1024],
  },
  "/images/brand/vielinea-about.jpg": {
    width: 1200,
    height: 1500,
    widths: [256, 384, 576, 768, 1024, 1200],
  },
};
