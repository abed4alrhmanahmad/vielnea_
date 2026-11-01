/**
 * GET /sitemap.xml — the storefront's XML sitemap for search engines.
 *
 * Built from the database so a new product appears without a deploy. It lists
 * only canonical, indexable pages: the public static pages, every product page,
 * and the category collections that actually contain products. Cart, wishlist,
 * sign-in, account and admin pages are noindex and deliberately absent, as are
 * sort/page/search variants of the shop. Every URL names the custom domain,
 * matching the canonical tags the frontend emits (frontend/src/lib/seo.ts).
 */
import { asyncHandler } from "../lib/http.js";
import { queryMany } from "../lib/db.js";
import { cached } from "../lib/cache.js";

const SITE_URL = "https://vielinea.com";
const STATIC_PATHS = ["/", "/shop", "/accessories", "/about", "/contact", "/faq"];
const CACHE_KEY = "seo:sitemap";
const CACHE_TTL_MS = 10 * 60_000;
/**
 * The same "complete product" rule New Arrivals uses (product.repository.ts):
 * at least one image and a price above $0. Drafts stay out of the sitemap, and
 * their pages are noindex on the frontend.
 */
const COMPLETE_PRODUCT = `EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.product_id = p.id)
          AND (p.price * (1 - p.discount / 100.0)) > 0`;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const absolute = (pathOrUrl: string) =>
  /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${SITE_URL}${pathOrUrl}`;

function urlEntry(path: string, lastmod?: Date, image?: string | null): string {
  return [
    "  <url>",
    `    <loc>${xmlEscape(absolute(path))}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod.toISOString()}</lastmod>`] : []),
    ...(image
      ? [`    <image:image><image:loc>${xmlEscape(absolute(image))}</image:loc></image:image>`]
      : []),
    "  </url>",
  ].join("\n");
}

async function buildSitemap(): Promise<string> {
  const [products, categories] = await Promise.all([
    queryMany<{ slug: string; updated_at: Date; image_url: string | null }>(
      `SELECT p.slug, p.updated_at,
              (SELECT pi.image_url FROM public.product_images pi
                WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS image_url
         FROM public.products p
        WHERE ${COMPLETE_PRODUCT}
        ORDER BY p.created_at DESC`,
    ),
    queryMany<{ slug: string; updated_at: Date }>(
      `SELECT c.slug, max(p.updated_at) AS updated_at
         FROM public.categories c
         JOIN public.products p ON p.category_id = c.id
        WHERE ${COMPLETE_PRODUCT}
        GROUP BY c.slug
        ORDER BY c.slug`,
    ),
  ]);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...STATIC_PATHS.map((path) => urlEntry(path)),
    ...categories.map((c) => urlEntry(`/shop?cat=${encodeURIComponent(c.slug)}`, c.updated_at)),
    ...products.map((p) =>
      urlEntry(`/product/${encodeURIComponent(p.slug)}`, p.updated_at, p.image_url),
    ),
    "</urlset>",
    "",
  ].join("\n");
}

export const seoController = {
  sitemap: asyncHandler(async (_req, res) => {
    const xml = await cached(CACHE_KEY, CACHE_TTL_MS, buildSitemap);
    res.type("application/xml").set("Cache-Control", "public, max-age=600").send(xml);
  }),
};
