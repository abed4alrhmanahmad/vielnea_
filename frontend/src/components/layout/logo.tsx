import { Link } from "@tanstack/react-router";
import logoImg from "@/assets/vielinea-logo.webp";

/**
 * Intrinsic size of the asset. The tallest placement is the footer at h-14
 * (56px), so the file is encoded at 3x that; `w-auto` plus a height class
 * still decides the rendered size, and these attributes only give the browser
 * the aspect ratio up front so the row cannot reflow while the mark decodes.
 */
const INTRINSIC_WIDTH = 129;
const INTRINSIC_HEIGHT = 168;

export function Logo({
  className = "",
  // The mark is a tall portrait "V" whose ink tapers to a point, so its height
  // is what has to be tuned per placement. The footer keeps the original size;
  // the header passes a smaller one to fit its 64px row.
  imgClassName = "h-12 md:h-14",
  // The header mark is in the first viewport, so it stays eager. The footer
  // sits thousands of pixels down the homepage and passes "lazy" so it stops
  // competing with the hero for bandwidth.
  loading = "eager",
}: {
  className?: string;
  imgClassName?: string;
  loading?: "eager" | "lazy";
}) {
  return (
    <Link to="/" className={`flex items-center ${className}`} aria-label="Vielinea — Home">
      <img
        src={logoImg}
        alt="Vielinea"
        width={INTRINSIC_WIDTH}
        height={INTRINSIC_HEIGHT}
        loading={loading}
        decoding="async"
        className={`block w-auto object-contain ${imgClassName}`}
      />
    </Link>
  );
}
