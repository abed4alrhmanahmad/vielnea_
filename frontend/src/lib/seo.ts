/**
 * Search-engine metadata shared by the public routes.
 *
 * Canonical and Open Graph URLs must be absolute and must always name the
 * custom domain, whichever host served the request (vielinea.com or the
 * vielnea.onrender.com origin), so search engines fold both into one page.
 * Structured data is built only from values the page itself displays.
 */
import type { StoreProduct } from "@/lib/api/mappers";

export const SITE_URL = "https://vielinea.com";
export const SITE_NAME = "Vielinea";
/** Shown when a link is shared and the page has no image of its own. */
export const DEFAULT_SHARE_IMAGE = "/images/brand/vielinea-hero.jpg";
const LOGO = "/images/brand/vielinea-logo.jpg";

/** "/shop?cat=x" -> "https://vielinea.com/shop?cat=x"; absolute URLs pass through. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/**
 * Canonical link plus the URL-, image- and card-level tags for a page. Titles
 * and descriptions stay in each route, where they already are.
 */
export function pageSeo(path: string, image: string = DEFAULT_SHARE_IMAGE) {
  const url = absoluteUrl(path);
  return {
    meta: [
      { property: "og:url", content: url },
      { property: "og:image", content: absoluteUrl(image) },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/** One JSON-LD block, in the shape TanStack's `head().scripts` expects. */
export function jsonLd(data: Record<string, unknown>) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

export function organizationJsonLd() {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl(LOGO),
  });
}

export function websiteJsonLd() {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
  });
}

export function productJsonLd(product: StoreProduct) {
  const url = absoluteUrl(`/product/${product.slug}`);
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.images.map(absoluteUrl),
    sku: product.slug,
    brand: { "@type": "Brand", name: SITE_NAME },
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "USD",
      price: product.finalPrice.toFixed(2),
      availability:
        product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    // Only real reviews: Google rejects a rating with no reviews behind it.
    ...(product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
  });
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>) {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: absoluteUrl(step.path),
    })),
  });
}
