import { IMAGE_VARIANTS } from "@/lib/image-variants";

/**
 * Everything a plain `<img>` takes, minus the two props this component owns.
 *
 * `sizes` is required rather than optional on purpose: a `srcSet` without an
 * accurate `sizes` makes the browser assume `100vw`, which for a product card
 * in a four-column grid picks a file four times wider than the card. Every call
 * site therefore has to state the width its layout actually renders at.
 */
type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "srcSet" | "sizes"> & {
  src: string | undefined;
  /** Rendered width of the image at each breakpoint, as a CSS `sizes` list. */
  sizes: string;
};

/**
 * An `<img>` that serves pre-built WebP variants when they exist for `src`.
 *
 * Image URLs arrive as API data, so this component cannot assume anything about
 * them. It looks `src` up in the generated manifest:
 *
 *  - **listed** (the seeded catalogue under `/images/...`) — renders a `<picture>`
 *    whose `<source>` offers the sibling `-<w>.webp` files, letting the browser
 *    pick by viewport and DPR. The `<img>` keeps the original URL, so a browser
 *    without WebP support downloads exactly what it downloads today.
 *  - **not listed** (every admin upload, including absolute Supabase Storage
 *    URLs) — renders the same bare `<img>` the call site used before. No 404s,
 *    no broken images, no change in behaviour.
 *
 * The `<picture>` is `display: contents`, so it leaves no box of its own: the
 * `<img>` stays the direct layout child of whatever wrapper the call site has,
 * and `size-full` / `absolute inset-0` classes keep resolving against that
 * wrapper exactly as they did before. Without it, a percentage height would
 * resolve against the inline `<picture>` instead and the image would collapse.
 */
export function ResponsiveImage({ src, sizes, ...imgProps }: Props) {
  const variants = src ? IMAGE_VARIANTS[src] : undefined;

  // A product saved without images: keep the frame's size with a neutral tile
  // rather than a source-less <img>, which renders as a broken image.
  if (!src) {
    const label = imgProps.alt;
    return (
      <span
        className={`block bg-secondary ${imgProps.className ?? ""}`}
        {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      />
    );
  }

  if (!variants) return <img src={src} {...imgProps} />;

  const stem = src.replace(/\.(jpe?g|png|webp)$/i, "");
  const srcSet = variants.widths.map((w) => `${stem}-${w}.webp ${w}w`).join(", ");

  return (
    <picture className="contents">
      <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      <img src={src} width={variants.width} height={variants.height} {...imgProps} />
    </picture>
  );
}

/**
 * Shared `sizes` values, derived from the real layouts rather than guessed.
 *
 * `container-luxe` is `max-width: 1400px` with `padding-inline: 1.25rem`, so its
 * content box is `min(100vw - 40px, 1360px)`. Each entry below subtracts that
 * padding and the grid's gaps, then divides by the column count for the
 * breakpoint — which is why the `min-width: 1400px` arm is a fixed pixel value:
 * past that point the container stops growing.
 */
export const IMAGE_SIZES = {
  /**
   * Product and accessory cards: `grid-cols-2 md:grid-cols-4 gap-6` (24px).
   * Widest rendering is 322px, so these cards never need the 1024px original.
   */
  card: "(min-width: 1400px) 322px, (min-width: 768px) calc((100vw - 112px) / 4), calc((100vw - 64px) / 2)",

  /** Homepage category cards: one column, then `md:grid-cols-3 gap-4` (16px). */
  categoryCard:
    "(min-width: 1400px) 443px, (min-width: 768px) calc((100vw - 72px) / 3), calc(100vw - 40px)",

  /**
   * Product detail main image: `md:grid-cols-2 gap-12` (48px), less the 80px
   * thumbnail rail and its 16px gap, which only exist from `md` up.
   */
  productDetail:
    "(min-width: 1400px) 560px, (min-width: 768px) calc((100vw - 88px) / 2 - 96px), calc(100vw - 40px)",

  /** Product detail thumbnail rail: a fixed `w-20`. */
  productThumb: "80px",

  /** Cart and wishlist line items: a fixed `w-24`. */
  lineItem: "96px",

  /** About page intro image: `md:grid-cols-2 gap-12` (48px) in the container. */
  halfColumn:
    "(min-width: 1400px) 656px, (min-width: 768px) calc((100vw - 88px) / 2), calc(100vw - 40px)",

  /**
   * Timeline milestones: a `max-w-3xl` (768px) rail, half of it per entry with
   * 48px of inner padding from `md` up, and a single 32px-indented column below.
   */
  timeline: "(min-width: 768px) 336px, calc(100vw - 72px)",
} as const;
