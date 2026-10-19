import { queryMany, queryOne } from "../lib/db.js";
import type { TimelineEntry, TimelineFeature } from "../types/models.js";

interface TimelineRow {
  id: string;
  year: string;
  title: string;
  description: string;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SectionRow {
  id: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  is_visible: boolean;
}

const SELECT = `
  SELECT id, year, title, description, image_url, display_order, is_active,
         created_at, updated_at
  FROM public.company_timeline
`;

/** created_at/updated_at come back as Date from pg; the API sends ISO strings. */
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapEntry(row: TimelineRow): TimelineEntry {
  return {
    id: row.id,
    year: row.year,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export const companyTimelineRepository = {
  /**
   * The feature switch and heading copy, read from the `timeline` section on
   * the About page. This is the existing CMS section-visibility mechanism —
   * there is no separate timeline settings table.
   *
   * A missing section means the feature was never seeded; that reads as
   * disabled rather than as an error, so the About page simply renders nothing.
   */
  async findFeature(): Promise<TimelineFeature> {
    const row = await queryOne<SectionRow>(
      `SELECT s.id, s.title, s.subtitle, s.content, s.is_visible
       FROM public.site_sections s
       JOIN public.site_pages p ON p.id = s.page_id
       WHERE p.slug = 'about' AND s.section_key = 'timeline'
       LIMIT 1`,
    );
    if (!row) {
      return { enabled: false, sectionId: null, title: null, subtitle: null, content: null };
    }
    return {
      enabled: row.is_visible,
      sectionId: row.id,
      title: row.title,
      subtitle: row.subtitle,
      content: row.content,
    };
  },

  /** Storefront read: active entries only, in timeline order. */
  async findActive(): Promise<TimelineEntry[]> {
    const rows = await queryMany<TimelineRow>(
      `${SELECT} WHERE is_active = true ORDER BY display_order, created_at`,
    );
    return rows.map(mapEntry);
  },

  /** Admin read: every entry, including hidden ones. */
  async findAll(): Promise<TimelineEntry[]> {
    const rows = await queryMany<TimelineRow>(`${SELECT} ORDER BY display_order, created_at`);
    return rows.map(mapEntry);
  },

  async findById(id: string): Promise<TimelineEntry | null> {
    const row = await queryOne<TimelineRow>(`${SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return row ? mapEntry(row) : null;
  },

  async create(input: {
    year: string;
    title: string;
    description?: string | undefined;
    imageUrl?: string | null | undefined;
    displayOrder?: number | undefined;
    isActive?: boolean | undefined;
  }): Promise<TimelineEntry> {
    // Insert and read are separate statements: rows written by a data-modifying
    // CTE are not visible to the rest of the same query's snapshot.
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO public.company_timeline
         (year, title, description, image_url, display_order, is_active)
       VALUES ($1, $2, $3, $4,
               COALESCE($5, (SELECT COALESCE(max(display_order), 0) + 1
                             FROM public.company_timeline)),
               $6)
       RETURNING id`,
      [
        input.year,
        input.title,
        input.description ?? "",
        input.imageUrl ?? null,
        input.displayOrder ?? null,
        input.isActive ?? true,
      ],
    );
    if (!inserted) throw new Error("Failed to create timeline entry");

    const created = await this.findById(inserted.id);
    if (!created) throw new Error("Timeline entry vanished immediately after creation");
    return created;
  },

  async update(
    id: string,
    input: {
      year?: string | undefined;
      title?: string | undefined;
      description?: string | undefined;
      imageUrl?: string | null | undefined;
      displayOrder?: number | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<TimelineEntry | null> {
    const columns: Record<string, string> = {
      year: "year",
      title: "title",
      description: "description",
      imageUrl: "image_url",
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
      `UPDATE public.company_timeline SET ${assignments.join(", ")}
       WHERE id = $${params.length} RETURNING id`,
      params,
    );
    return updated ? this.findById(updated.id) : null;
  },

  async remove(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.company_timeline WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },
};
