import { queryMany, queryOne } from "../lib/db.js";
import type { SelectedImage } from "../types/models.js";

interface SelectedImageRow {
  id: string;
  image_url: string;
  /** NULL when the admin left the link blank — the tile then opens the homepage. */
  instagram_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

const SELECT = `
  SELECT id, image_url, instagram_url, display_order, is_active, created_at, updated_at
  FROM public.selected_images
`;

/** created_at/updated_at come back as Date from pg; the API sends ISO strings. */
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSelectedImage(row: SelectedImageRow): SelectedImage {
  return {
    id: row.id,
    imageUrl: row.image_url,
    instagramUrl: row.instagram_url,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/**
 * Rows are never grouped or de-duplicated by instagram_url. Two images that
 * link to the same post are two independent rows and both are returned.
 */
export const selectedImageRepository = {
  /** Storefront read: active images only, in marquee order. */
  async findActive(): Promise<SelectedImage[]> {
    const rows = await queryMany<SelectedImageRow>(
      `${SELECT} WHERE is_active = true ORDER BY display_order, created_at`,
    );
    return rows.map(mapSelectedImage);
  },

  /** Admin read: every image, including hidden ones. */
  async findAll(): Promise<SelectedImage[]> {
    const rows = await queryMany<SelectedImageRow>(`${SELECT} ORDER BY display_order, created_at`);
    return rows.map(mapSelectedImage);
  },

  async findById(id: string): Promise<SelectedImage | null> {
    const row = await queryOne<SelectedImageRow>(`${SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return row ? mapSelectedImage(row) : null;
  },

  async create(input: {
    imageUrl: string;
    instagramUrl?: string | null | undefined;
    displayOrder?: number | undefined;
    isActive?: boolean | undefined;
  }): Promise<SelectedImage> {
    // Insert and read are separate statements: rows written by a data-modifying
    // CTE are not visible to the rest of the same query's snapshot.
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO public.selected_images (image_url, instagram_url, display_order, is_active)
       VALUES ($1, $2,
               COALESCE($3, (SELECT COALESCE(max(display_order), 0) + 1 FROM public.selected_images)),
               $4)
       RETURNING id`,
      [
        input.imageUrl,
        input.instagramUrl ?? null,
        input.displayOrder ?? null,
        input.isActive ?? true,
      ],
    );
    if (!inserted) throw new Error("Failed to create selected image");

    const created = await this.findById(inserted.id);
    if (!created) throw new Error("Selected image vanished immediately after creation");
    return created;
  },

  async update(
    id: string,
    input: {
      imageUrl?: string | undefined;
      // null clears the link; undefined leaves whatever is stored alone. The
      // loop below distinguishes the two, so clearing is a real operation.
      instagramUrl?: string | null | undefined;
      displayOrder?: number | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<SelectedImage | null> {
    const columns: Record<string, string> = {
      imageUrl: "image_url",
      instagramUrl: "instagram_url",
      displayOrder: "display_order",
      isActive: "is_active",
    };
    const assignments: string[] = [];
    const params: unknown[] = [];

    for (const [key, column] of Object.entries(columns)) {
      const value = (input as Record<string, unknown>)[key];
      if (value === undefined) continue;
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    }
    if (assignments.length === 0) return this.findById(id);

    params.push(id);
    const updated = await queryOne<{ id: string }>(
      `UPDATE public.selected_images SET ${assignments.join(", ")}
       WHERE id = $${params.length} RETURNING id`,
      params,
    );
    return updated ? this.findById(updated.id) : null;
  },

  async remove(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.selected_images WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },
};
