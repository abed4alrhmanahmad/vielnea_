import { queryMany, queryOne } from "../lib/db.js";
import type { Faq, FaqSection } from "../types/models.js";

interface FaqRow {
  id: string;
  question: string;
  answer: string;
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
  SELECT id, question, answer, display_order, is_active, created_at, updated_at
  FROM public.faqs
`;

/** created_at/updated_at come back as Date from pg; the API sends ISO strings. */
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapFaq(row: FaqRow): Faq {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export const faqRepository = {
  /**
   * The section switch and header copy, read from the `faq` section on the FAQ
   * page. This is the existing CMS section-visibility mechanism — there is no
   * separate FAQ settings table.
   *
   * A missing section reads as disabled rather than as an error, so the pages
   * simply render nothing.
   */
  async findSection(): Promise<FaqSection> {
    const row = await queryOne<SectionRow>(
      `SELECT s.id, s.title, s.subtitle, s.content, s.is_visible
       FROM public.site_sections s
       JOIN public.site_pages p ON p.id = s.page_id
       WHERE p.slug = 'faq' AND s.section_key = 'faq'
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

  /** Storefront read: active questions only, in display order. */
  async findActive(): Promise<Faq[]> {
    const rows = await queryMany<FaqRow>(
      `${SELECT} WHERE is_active = true ORDER BY display_order, created_at`,
    );
    return rows.map(mapFaq);
  },

  /** Admin read: every question, including hidden ones. */
  async findAll(): Promise<Faq[]> {
    const rows = await queryMany<FaqRow>(`${SELECT} ORDER BY display_order, created_at`);
    return rows.map(mapFaq);
  },

  async findById(id: string): Promise<Faq | null> {
    const row = await queryOne<FaqRow>(`${SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return row ? mapFaq(row) : null;
  },

  async create(input: {
    question: string;
    answer?: string | undefined;
    displayOrder?: number | undefined;
    isActive?: boolean | undefined;
  }): Promise<Faq> {
    // Insert and read are separate statements: rows written by a data-modifying
    // CTE are not visible to the rest of the same query's snapshot.
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO public.faqs (question, answer, display_order, is_active)
       VALUES ($1, $2,
               COALESCE($3, (SELECT COALESCE(max(display_order), 0) + 1 FROM public.faqs)),
               $4)
       RETURNING id`,
      [input.question, input.answer ?? "", input.displayOrder ?? null, input.isActive ?? true],
    );
    if (!inserted) throw new Error("Failed to create FAQ");

    const created = await this.findById(inserted.id);
    if (!created) throw new Error("FAQ vanished immediately after creation");
    return created;
  },

  async update(
    id: string,
    input: {
      question?: string | undefined;
      answer?: string | undefined;
      displayOrder?: number | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<Faq | null> {
    const columns: Record<string, string> = {
      question: "question",
      answer: "answer",
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
      `UPDATE public.faqs SET ${assignments.join(", ")}
       WHERE id = $${params.length} RETURNING id`,
      params,
    );
    return updated ? this.findById(updated.id) : null;
  },

  async remove(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.faqs WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },
};
