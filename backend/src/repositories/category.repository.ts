import { queryMany, queryOne } from "../lib/db.js";
import { isUuid } from "../utils/slug.js";
import type { Category } from "../types/models.js";

interface CategoryRow {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  product_count: number;
}

const SELECT = `
  SELECT c.id, c.slug, c.label, c.description, c.image_url, c.sort_order,
         (SELECT count(*)::int FROM public.products p WHERE p.category_id = c.id) AS product_count
  FROM public.categories c
`;

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    productCount: row.product_count,
  };
}

export const categoryRepository = {
  async findAll(): Promise<Category[]> {
    const rows = await queryMany<CategoryRow>(`${SELECT} ORDER BY c.sort_order, c.label`);
    return rows.map(mapCategory);
  },

  async findByIdOrSlug(idOrSlug: string): Promise<Category | null> {
    const row = await queryOne<CategoryRow>(
      `${SELECT} WHERE ${isUuid(idOrSlug) ? "c.id = $1" : "c.slug = $1"} LIMIT 1`,
      [idOrSlug],
    );
    return row ? mapCategory(row) : null;
  },

  async create(input: {
    slug: string;
    label: string;
    description?: string | null | undefined;
    imageUrl?: string | null | undefined;
    sortOrder?: number | undefined;
  }): Promise<Category> {
    // Insert and read are separate statements: rows written by a data-modifying
    // CTE are not visible to the rest of the same query's snapshot.
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO public.categories (slug, label, description, image_url, sort_order)
       VALUES ($1, $2, $3, $4,
               COALESCE($5, (SELECT COALESCE(max(sort_order), 0) + 1 FROM public.categories)))
       RETURNING id`,
      [
        input.slug,
        input.label,
        input.description ?? null,
        input.imageUrl ?? null,
        input.sortOrder ?? null,
      ],
    );
    if (!inserted) throw new Error("Failed to create category");

    const created = await this.findByIdOrSlug(inserted.id);
    if (!created) throw new Error("Category vanished immediately after creation");
    return created;
  },

  async update(
    id: string,
    input: {
      slug?: string | undefined;
      label?: string | undefined;
      description?: string | null | undefined;
      imageUrl?: string | null | undefined;
      sortOrder?: number | undefined;
    },
  ): Promise<Category | null> {
    const columns: Record<string, string> = {
      slug: "slug",
      label: "label",
      description: "description",
      imageUrl: "image_url",
      sortOrder: "sort_order",
    };
    const assignments: string[] = [];
    const params: unknown[] = [];

    for (const [key, column] of Object.entries(columns)) {
      const value = (input as Record<string, unknown>)[key];
      if (value === undefined) continue;
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    }
    if (assignments.length === 0) return this.findByIdOrSlug(id);

    params.push(id);
    const updated = await queryOne<{ id: string }>(
      `UPDATE public.categories SET ${assignments.join(", ")} WHERE id = $${params.length} RETURNING id`,
      params,
    );
    return updated ? this.findByIdOrSlug(updated.id) : null;
  },

  /** Products reference categories with ON DELETE RESTRICT, so a category in
   *  use cannot be removed — this reports that case instead of erroring. */
  async productCount(id: string): Promise<number> {
    const row = await queryOne<{ count: number }>(
      "SELECT count(*)::int AS count FROM public.products WHERE category_id = $1",
      [id],
    );
    return row?.count ?? 0;
  },

  async remove(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.categories WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },

  async existsBySlug(slug: string): Promise<boolean> {
    const row = await queryOne<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM public.categories WHERE slug = $1) AS exists",
      [slug],
    );
    return row?.exists ?? false;
  },

  /** Resolves a slug or UUID to the canonical category UUID. */
  async resolveId(idOrSlug: string): Promise<string | null> {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM public.categories WHERE ${isUuid(idOrSlug) ? "id = $1" : "slug = $1"} LIMIT 1`,
      [idOrSlug],
    );
    return row?.id ?? null;
  },
};
