import { queryMany, queryOne } from "../lib/db.js";
import type { HeroSlide } from "../types/models.js";

interface HeroSlideRow {
  id: string;
  image_url: string;
  eyebrow_text: string;
  heading: string;
  description: string;
  button_text: string;
  button_link: string;
  display_order: number;
  is_active: boolean;
  object_position: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const SELECT = `
  SELECT id, image_url, eyebrow_text, heading, description, button_text,
         button_link, display_order, is_active, object_position, created_at, updated_at
  FROM public.hero_slides
`;

/** created_at/updated_at come back as Date from pg; the API sends ISO strings. */
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSlide(row: HeroSlideRow): HeroSlide {
  return {
    id: row.id,
    imageUrl: row.image_url,
    eyebrowText: row.eyebrow_text,
    heading: row.heading,
    description: row.description,
    buttonText: row.button_text,
    buttonLink: row.button_link,
    displayOrder: row.display_order,
    isActive: row.is_active,
    objectPosition: row.object_position,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export const heroSlideRepository = {
  /** Storefront read: active slides only, in carousel order. */
  async findActive(): Promise<HeroSlide[]> {
    const rows = await queryMany<HeroSlideRow>(
      `${SELECT} WHERE is_active = true ORDER BY display_order, created_at`,
    );
    return rows.map(mapSlide);
  },

  /** Admin read: every slide, including hidden ones. */
  async findAll(): Promise<HeroSlide[]> {
    const rows = await queryMany<HeroSlideRow>(`${SELECT} ORDER BY display_order, created_at`);
    return rows.map(mapSlide);
  },

  async findById(id: string): Promise<HeroSlide | null> {
    const row = await queryOne<HeroSlideRow>(`${SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return row ? mapSlide(row) : null;
  },

  async create(input: {
    imageUrl: string;
    eyebrowText?: string | undefined;
    heading: string;
    description?: string | undefined;
    buttonText?: string | undefined;
    buttonLink?: string | undefined;
    displayOrder?: number | undefined;
    isActive?: boolean | undefined;
    objectPosition?: string | undefined;
  }): Promise<HeroSlide> {
    // Insert and read are separate statements: rows written by a data-modifying
    // CTE are not visible to the rest of the same query's snapshot.
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO public.hero_slides
         (image_url, eyebrow_text, heading, description, button_text, button_link,
          display_order, is_active, object_position)
       VALUES ($1, $2, $3, $4, $5, $6,
               COALESCE($7, (SELECT COALESCE(max(display_order), 0) + 1 FROM public.hero_slides)),
               $8, $9)
       RETURNING id`,
      [
        input.imageUrl,
        input.eyebrowText ?? "",
        input.heading,
        input.description ?? "",
        input.buttonText ?? "",
        input.buttonLink ?? "/shop",
        input.displayOrder ?? null,
        input.isActive ?? true,
        input.objectPosition ?? "top",
      ],
    );
    if (!inserted) throw new Error("Failed to create hero slide");

    const created = await this.findById(inserted.id);
    if (!created) throw new Error("Hero slide vanished immediately after creation");
    return created;
  },

  async update(
    id: string,
    input: {
      imageUrl?: string | undefined;
      eyebrowText?: string | undefined;
      heading?: string | undefined;
      description?: string | undefined;
      buttonText?: string | undefined;
      buttonLink?: string | undefined;
      displayOrder?: number | undefined;
      isActive?: boolean | undefined;
      objectPosition?: string | undefined;
    },
  ): Promise<HeroSlide | null> {
    const columns: Record<string, string> = {
      imageUrl: "image_url",
      eyebrowText: "eyebrow_text",
      heading: "heading",
      description: "description",
      buttonText: "button_text",
      buttonLink: "button_link",
      displayOrder: "display_order",
      isActive: "is_active",
      objectPosition: "object_position",
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
      `UPDATE public.hero_slides SET ${assignments.join(", ")}
       WHERE id = $${params.length} RETURNING id`,
      params,
    );
    return updated ? this.findById(updated.id) : null;
  },

  async remove(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.hero_slides WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },
};
