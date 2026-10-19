import { queryMany, queryOne } from "../lib/db.js";
import { isUuid, toMoney } from "../utils/slug.js";
import type { Accessory, AccessoryImage } from "../types/models.js";
import type { AccessoryQuery } from "../schemas/index.js";

interface AccessoryRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  is_available: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  images: AccessoryImage[] | null;
}

/**
 * Single source of truth for accessory reads. The json_agg subquery pulls the
 * images in the same round trip, mirroring how products are read.
 */
const ACCESSORY_SELECT = `
  SELECT
    a.id, a.slug, a.name, a.description,
    a.price, a.discount, a.stock,
    a.is_available, a.is_featured, a.sort_order,
    a.created_at, a.updated_at,
    img.images
  FROM public.accessories a
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'id', ai.id, 'imageUrl', ai.image_url,
               'altText', ai.alt_text, 'sortOrder', ai.sort_order
             ) ORDER BY ai.sort_order, ai.created_at
           ) AS images
    FROM public.accessory_images ai WHERE ai.accessory_id = a.id
  ) img ON true
`;

function mapAccessory(row: AccessoryRow): Accessory {
  const images = row.images ?? [];
  const price = Number(row.price);
  const discount = Number(row.discount);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price,
    discount,
    finalPrice: toMoney(price * (1 - discount / 100)),
    stock: row.stock,
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
    sortOrder: row.sort_order,
    images: images.map((i) => i.imageUrl),
    imageDetails: images,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const SORT_SQL: Record<NonNullable<AccessoryQuery["sort"]> | "default", string> = {
  newest: "a.created_at DESC",
  oldest: "a.created_at ASC",
  price_asc: "(a.price * (1 - a.discount / 100.0)) ASC, a.name ASC",
  price_desc: "(a.price * (1 - a.discount / 100.0)) DESC, a.name ASC",
  name_asc: "a.name ASC",
  name_desc: "a.name DESC",
  manual: "a.sort_order ASC, a.created_at DESC",
  // The storefront shows the admin's manual order first, newest as a tiebreak.
  default: "a.sort_order ASC, a.created_at DESC",
};

export interface AccessoryListResult {
  accessories: Accessory[];
  total: number;
}

export const accessoryRepository = {
  /** Filtered, sorted, paginated list. All inputs are parameterised. */
  async findMany(query: AccessoryQuery): Promise<AccessoryListResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(`(a.name ILIKE $${params.length} OR a.description ILIKE $${params.length})`);
    }
    if (query.minPrice !== undefined) {
      params.push(query.minPrice);
      conditions.push(`(a.price * (1 - a.discount / 100.0)) >= $${params.length}`);
    }
    if (query.maxPrice !== undefined) {
      params.push(query.maxPrice);
      conditions.push(`(a.price * (1 - a.discount / 100.0)) <= $${params.length}`);
    }
    if (query.featured) conditions.push("a.is_featured = true");
    if (query.inStock) conditions.push("a.stock > 0");
    // Defaults to available-only, so a hidden accessory never reaches a shopper
    // unless the caller explicitly asked for the other sets.
    if (query.availability === "hidden") conditions.push("a.is_available = false");
    else if (query.availability !== "all") conditions.push("a.is_available = true");

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = SORT_SQL[query.sort ?? "default"];
    const offset = (query.page - 1) * query.limit;

    // Independent reads (separate param lists, no shared transaction) — run
    // concurrently rather than one after another to halve this endpoint's DB
    // round trips. See product.repository.ts's findMany for the same fix.
    const [countRow, rows] = await Promise.all([
      queryOne<{ total: number }>(
        `SELECT count(*)::int AS total FROM public.accessories a ${where}`,
        params,
      ),
      queryMany<AccessoryRow>(
        `${ACCESSORY_SELECT} ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.limit, offset],
      ),
    ]);

    return { accessories: rows.map(mapAccessory), total: countRow?.total ?? 0 };
  },

  /** Looks up by UUID or slug, so links keep working either way. */
  async findByIdOrSlug(idOrSlug: string): Promise<Accessory | null> {
    const row = await queryOne<AccessoryRow>(
      `${ACCESSORY_SELECT} WHERE ${isUuid(idOrSlug) ? "a.id = $1" : "a.slug = $1"} LIMIT 1`,
      [idOrSlug],
    );
    return row ? mapAccessory(row) : null;
  },

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const row = excludeId
      ? await queryOne<{ exists: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM public.accessories WHERE slug = $1 AND id <> $2) AS exists",
          [slug, excludeId],
        )
      : await queryOne<{ exists: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM public.accessories WHERE slug = $1) AS exists",
          [slug],
        );
    return row?.exists ?? false;
  },

  async deleteById(id: string): Promise<boolean> {
    // accessory_images cascades on delete.
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.accessories WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },

  /** Count of accessories, split by availability. Used by the admin summary. */
  async counts(): Promise<{ total: number; available: number }> {
    const row = await queryOne<{ total: number; available: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE is_available)::int AS available
       FROM public.accessories`,
    );
    return row ?? { total: 0, available: 0 };
  },

  mapAccessory,
  ACCESSORY_SELECT,
};
