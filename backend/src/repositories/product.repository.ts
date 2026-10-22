import type { PoolClient } from "pg";
import { pool, queryMany, queryOne } from "../lib/db.js";
import { isUuid, toMoney } from "../utils/slug.js";
import type { Product, ProductImage, ProductMeasurement, ProductSize } from "../types/models.js";
import type { ProductQuery } from "../schemas/index.js";

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  category_id: string | null;
  category_slug: string | null;
  category_label: string | null;
  price: number;
  discount: number;
  stock: number;
  rating: number;
  review_count: number;
  is_featured: boolean;
  is_best_seller: boolean;
  is_new_arrival: boolean;
  has_gift: boolean;
  model_height: string | null;
  model_weight: string | null;
  wearing_size: string | null;
  created_at: Date;
  updated_at: Date;
  images: ProductImage[] | null;
  sizes: ProductSize[] | null;
  measurements: ProductMeasurement[] | null;
}

/**
 * Single source of truth for product reads. json_agg subqueries pull images,
 * sizes and measurements in one round trip instead of N+1 follow-ups.
 */
const PRODUCT_SELECT = `
  SELECT
    p.id, p.slug, p.title, p.description, p.category_id,
    c.slug  AS category_slug,
    c.label AS category_label,
    p.price, p.discount, p.stock, p.rating, p.review_count,
    p.is_featured, p.is_best_seller, p.is_new_arrival, p.has_gift,
    p.model_height, p.model_weight, p.wearing_size,
    p.created_at, p.updated_at,
    img.images, sz.sizes, ms.measurements
  FROM public.products p
  -- LEFT, not JOIN: category is optional, and an inner join here would make
  -- an uncategorised product invisible to every read below (including the
  -- one create()/update() runs to return the row they just wrote).
  LEFT JOIN public.categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'id', pi.id, 'imageUrl', pi.image_url,
               'altText', pi.alt_text, 'sortOrder', pi.sort_order
             ) ORDER BY pi.sort_order, pi.created_at
           ) AS images
    FROM public.product_images pi WHERE pi.product_id = p.id
  ) img ON true
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object('size', ps.size, 'stock', ps.stock, 'sortOrder', ps.sort_order)
             ORDER BY ps.sort_order, ps.size
           ) AS sizes
    FROM public.product_sizes ps WHERE ps.product_id = p.id
  ) sz ON true
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'size', pm.size, 'bust', pm.bust, 'waist', pm.waist,
               'hips', pm.hips, 'length', pm.length, 'labels', pm.labels
             ) ORDER BY pm.size
           ) AS measurements
    FROM public.product_measurements pm WHERE pm.product_id = p.id
  ) ms ON true
`;

function mapProduct(row: ProductRow): Product {
  const images = row.images ?? [];
  const sizes = row.sizes ?? [];
  const measurements = row.measurements ?? [];
  const price = Number(row.price);
  const discount = Number(row.discount);

  // The storefront renders `measurements` as an ordered label/value map, which
  // is preserved verbatim in the `labels` jsonb column.
  const primaryMeasurement = measurements[0];

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    // Coalesced rather than left null: `Product.category*` stays a plain
    // string everywhere it's already consumed (filters, badges, sorting),
    // and "" reads the same way "" already does for a blank title.
    categoryId: row.category_id ?? "",
    category: row.category_slug ?? "",
    categoryLabel: row.category_label ?? "",
    price,
    discount,
    finalPrice: toMoney(price * (1 - discount / 100)),
    stock: row.stock,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    isFeatured: row.is_featured,
    isBestSeller: row.is_best_seller,
    isNewArrival: row.is_new_arrival,
    hasGift: row.has_gift,
    modelHeight: row.model_height,
    modelWeight: row.model_weight,
    wearingSize: row.wearing_size,
    images: images.map((i) => i.imageUrl),
    imageDetails: images,
    sizes: sizes.map((s) => s.size),
    sizeDetails: sizes,
    measurements: primaryMeasurement?.labels ?? {},
    measurementDetails: measurements,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Units sold per product, by the same rule as the admin dashboard's Best
 * Sellers (admin.repository): every order except cancelled ones.
 */
const UNITS_SOLD_SQL = `(SELECT COALESCE(sum(oi.quantity), 0)
   FROM public.order_items oi
   JOIN public.orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
   WHERE oi.product_id = p.id)`;

const SORT_SQL: Record<NonNullable<ProductQuery["sort"]> | "default", string> = {
  newest: "p.is_new_arrival DESC, p.created_at DESC",
  oldest: "p.created_at ASC",
  price_asc: "(p.price * (1 - p.discount / 100.0)) ASC, p.title ASC",
  price_desc: "(p.price * (1 - p.discount / 100.0)) DESC, p.title ASC",
  rating: "p.rating DESC, p.review_count DESC",
  title_asc: "p.title ASC",
  title_desc: "p.title DESC",
  recent: "p.created_at DESC",
  best_selling: `${UNITS_SOLD_SQL} DESC, p.created_at DESC`,
  default: "p.is_new_arrival DESC, p.created_at DESC",
};

export interface ProductListResult {
  products: Product[];
  total: number;
}

export const productRepository = {
  /** Filtered, sorted, paginated list. All inputs are parameterised. */
  async findMany(query: ProductQuery): Promise<ProductListResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(`(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    if (query.category) {
      params.push(query.category);
      conditions.push(`(c.slug = $${params.length} OR c.id::text = $${params.length})`);
    }
    if (query.minPrice !== undefined) {
      params.push(query.minPrice);
      conditions.push(`(p.price * (1 - p.discount / 100.0)) >= $${params.length}`);
    }
    if (query.maxPrice !== undefined) {
      params.push(query.maxPrice);
      conditions.push(`(p.price * (1 - p.discount / 100.0)) <= $${params.length}`);
    }
    if (query.featured) conditions.push("p.is_featured = true");
    if (query.bestSeller) conditions.push("p.is_best_seller = true");
    if (query.newArrival) conditions.push("p.is_new_arrival = true");
    if (query.gift) conditions.push("p.has_gift = true");
    if (query.inStock) conditions.push("p.stock > 0");
    if (query.complete) {
      conditions.push("EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.product_id = p.id)");
      conditions.push("(p.price * (1 - p.discount / 100.0)) > 0");
    }
    // A best-seller ranking lists only products that have actually sold.
    if (query.sort === "best_selling") conditions.push(`${UNITS_SOLD_SQL} > 0`);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = SORT_SQL[query.sort ?? "default"];
    const offset = (query.page - 1) * query.limit;

    // The total count and the page of rows are independent reads (different
    // param lists, no shared transaction) — running them concurrently instead
    // of one after another halves this endpoint's DB round trips, which is
    // the dominant cost when the database is remote (each round trip here
    // measured ~250ms regardless of query complexity).
    const [countRow, rows] = await Promise.all([
      queryOne<{ total: number }>(
        `SELECT count(*)::int AS total
         FROM public.products p
         LEFT JOIN public.categories c ON c.id = p.category_id
         ${where}`,
        params,
      ),
      queryMany<ProductRow>(
        `${PRODUCT_SELECT} ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.limit, offset],
      ),
    ]);

    return { products: rows.map(mapProduct), total: countRow?.total ?? 0 };
  },

  /** Looks up by UUID or slug, so storefront links keep working either way. */
  async findByIdOrSlug(idOrSlug: string): Promise<Product | null> {
    const row = await queryOne<ProductRow>(
      `${PRODUCT_SELECT} WHERE ${isUuid(idOrSlug) ? "p.id = $1" : "p.slug = $1"} LIMIT 1`,
      [idOrSlug],
    );
    return row ? mapProduct(row) : null;
  },

  async findBySlug(slug: string): Promise<Product | null> {
    const row = await queryOne<ProductRow>(`${PRODUCT_SELECT} WHERE p.slug = $1 LIMIT 1`, [slug]);
    return row ? mapProduct(row) : null;
  },

  /** Resolves a UUID or slug to the canonical UUID. */
  async resolveId(idOrSlug: string, client?: PoolClient): Promise<string | null> {
    const runner = client ?? pool;
    const result = await runner.query<{ id: string }>(
      `SELECT id FROM public.products WHERE ${isUuid(idOrSlug) ? "id = $1" : "slug = $1"} LIMIT 1`,
      [idOrSlug],
    );
    return result.rows[0]?.id ?? null;
  },

  /** Same-category products, excluding the one being viewed. */
  async findRelated(productId: string, categoryId: string, limit: number): Promise<Product[]> {
    const rows = await queryMany<ProductRow>(
      `${PRODUCT_SELECT}
       WHERE p.category_id = $1 AND p.id <> $2
       ORDER BY p.is_best_seller DESC, p.rating DESC
       LIMIT $3`,
      [categoryId, productId, limit],
    );
    return rows.map(mapProduct);
  },

  /** Batch load by UUID — used by cart and wishlist to avoid N+1 queries. */
  async findByIds(ids: readonly string[]): Promise<Map<string, Product>> {
    if (ids.length === 0) return new Map();
    const rows = await queryMany<ProductRow>(`${PRODUCT_SELECT} WHERE p.id = ANY($1::uuid[])`, [
      ids,
    ]);
    return new Map(rows.map((row) => [row.id, mapProduct(row)]));
  },

  async existsBySlug(slug: string): Promise<boolean> {
    const row = await queryOne<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM public.products WHERE slug = $1) AS exists",
      [slug],
    );
    return row?.exists ?? false;
  },

  async deleteById(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.products WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },

  /** Per-size stock for a product, used by cart and checkout validation. */
  async findSizeStock(
    productId: string,
    size: string,
    client?: PoolClient,
  ): Promise<{ stock: number } | null> {
    const runner = client ?? pool;
    const result = await runner.query<{ stock: number }>(
      "SELECT stock FROM public.product_sizes WHERE product_id = $1 AND size = $2 LIMIT 1",
      [productId, size],
    );
    return result.rows[0] ?? null;
  },

  mapProduct,
  PRODUCT_SELECT,
};
