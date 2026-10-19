import { pool, queryMany, queryOne } from "../lib/db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SiteSection {
  id: string;
  sectionKey: string;
  sectionType: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  imageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  displayOrder: number;
  isVisible: boolean;
  settings: Record<string, unknown>;
}

export interface SitePage {
  id: string;
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  isPublished: boolean;
  sections: SiteSection[];
}

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  quote: string;
  rating: number | null;
  sortOrder: number;
  isActive: boolean;
}

export interface StoreSettings {
  storeName: string;
  storeEmail: string;
  storePhone: string;
  storeAddress: string;
  currency: string;
  standardShipping: number;
  socialInstagram: string;
  socialFacebook: string;
  socialTwitter: string;
}

interface SectionRow {
  id: string;
  section_key: string;
  section_type: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  image_url: string | null;
  button_text: string | null;
  button_url: string | null;
  display_order: number;
  is_visible: boolean;
  settings: Record<string, unknown> | null;
}

interface PageRow {
  id: string;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  is_published: boolean;
  sections: SiteSection[] | null;
}

/** json_agg pulls a page's sections in one round trip, already ordered. */
const PAGE_SELECT = `
  SELECT p.id, p.slug, p.title, p.meta_title, p.meta_description,
         p.og_title, p.og_description, p.og_image, p.is_published,
         sec.sections
  FROM public.site_pages p
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'id', s.id, 'sectionKey', s.section_key, 'sectionType', s.section_type,
               'title', s.title, 'subtitle', s.subtitle, 'content', s.content,
               'imageUrl', s.image_url, 'buttonText', s.button_text,
               'buttonUrl', s.button_url, 'displayOrder', s.display_order,
               'isVisible', s.is_visible, 'settings', s.settings
             ) ORDER BY s.display_order, s.section_key
           ) AS sections
    FROM public.site_sections s WHERE s.page_id = p.id
  ) sec ON true
`;

function mapPage(row: PageRow): SitePage {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    ogTitle: row.og_title,
    ogDescription: row.og_description,
    ogImage: row.og_image,
    isPublished: row.is_published,
    sections: row.sections ?? [],
  };
}

function mapSection(row: SectionRow): SiteSection {
  return {
    id: row.id,
    sectionKey: row.section_key,
    sectionType: row.section_type,
    title: row.title,
    subtitle: row.subtitle,
    content: row.content,
    imageUrl: row.image_url,
    buttonText: row.button_text,
    buttonUrl: row.button_url,
    displayOrder: row.display_order,
    isVisible: row.is_visible,
    settings: row.settings ?? {},
  };
}

const SECTION_RETURNING = `
  id, section_key, section_type, title, subtitle, content, image_url,
  button_text, button_url, display_order, is_visible, settings
`;

export const cmsRepository = {
  // ----------------------------------------------------------- settings ----
  /** All settings groups as one object: { announcement: {...}, footer: {...} }. */
  async allSettings(): Promise<Record<string, unknown>> {
    const rows = await queryMany<{ key: string; value: unknown }>(
      "SELECT key, value FROM public.site_content ORDER BY key",
    );
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  },

  async getSetting(key: string): Promise<unknown | null> {
    const row = await queryOne<{ value: unknown }>(
      "SELECT value FROM public.site_content WHERE key = $1",
      [key],
    );
    return row ? row.value : null;
  },

  async setSetting(key: string, value: unknown): Promise<unknown> {
    const row = await queryOne<{ value: unknown }>(
      `INSERT INTO public.site_content (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       RETURNING value`,
      [key, JSON.stringify(value)],
    );
    return row?.value ?? value;
  },

  // ------------------------------------------------------ store settings ----
  async storeSettings(): Promise<StoreSettings> {
    const row = await queryOne<{
      store_name: string;
      store_email: string;
      store_phone: string;
      store_address: string;
      currency: string;
      standard_shipping: number;
      social_instagram: string;
      social_facebook: string;
      social_twitter: string;
    }>("SELECT * FROM public.store_settings WHERE id = 1");

    return {
      storeName: row?.store_name ?? "Vielinea",
      storeEmail: row?.store_email ?? "hello@vielinea.com",
      storePhone: row?.store_phone ?? "",
      storeAddress: row?.store_address ?? "",
      currency: row?.currency ?? "USD",
      // Defaults match the storefront's stated policy if the row is missing.
      standardShipping: Number(row?.standard_shipping ?? 15),
      socialInstagram: row?.social_instagram ?? "",
      socialFacebook: row?.social_facebook ?? "",
      socialTwitter: row?.social_twitter ?? "",
    };
  },

  async updateStoreSettings(input: Partial<StoreSettings>): Promise<StoreSettings> {
    const columns: Record<keyof StoreSettings, string> = {
      storeName: "store_name",
      storeEmail: "store_email",
      storePhone: "store_phone",
      storeAddress: "store_address",
      currency: "currency",
      standardShipping: "standard_shipping",
      socialInstagram: "social_instagram",
      socialFacebook: "social_facebook",
      socialTwitter: "social_twitter",
    };

    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(columns) as Array<[keyof StoreSettings, string]>) {
      const value = input[key];
      if (value === undefined) continue;
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    }

    if (assignments.length > 0) {
      // Ensure the singleton row exists before updating it.
      await pool.query("INSERT INTO public.store_settings (id) VALUES (1) ON CONFLICT DO NOTHING");
      await pool.query(
        `UPDATE public.store_settings SET ${assignments.join(", ")} WHERE id = 1`,
        params,
      );
    }
    return this.storeSettings();
  },

  // -------------------------------------------------------------- pages ----
  async listPages(): Promise<SitePage[]> {
    const rows = await queryMany<PageRow>(`${PAGE_SELECT} ORDER BY p.slug`);
    return rows.map(mapPage);
  },

  async findPageBySlug(slug: string, publishedOnly: boolean): Promise<SitePage | null> {
    const row = await queryOne<PageRow>(
      `${PAGE_SELECT} WHERE p.slug = $1 ${publishedOnly ? "AND p.is_published = true" : ""} LIMIT 1`,
      [slug],
    );
    return row ? mapPage(row) : null;
  },

  async findPageById(id: string): Promise<SitePage | null> {
    const row = await queryOne<PageRow>(`${PAGE_SELECT} WHERE p.id = $1 LIMIT 1`, [id]);
    return row ? mapPage(row) : null;
  },

  async updatePage(
    id: string,
    input: Partial<{
      title: string;
      metaTitle: string | null;
      metaDescription: string | null;
      ogTitle: string | null;
      ogDescription: string | null;
      ogImage: string | null;
      isPublished: boolean;
    }>,
  ): Promise<SitePage | null> {
    const columns: Record<string, string> = {
      title: "title",
      metaTitle: "meta_title",
      metaDescription: "meta_description",
      ogTitle: "og_title",
      ogDescription: "og_description",
      ogImage: "og_image",
      isPublished: "is_published",
    };

    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      const value = (input as Record<string, unknown>)[key];
      if (value === undefined) continue;
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    }
    if (assignments.length === 0) return this.findPageById(id);

    params.push(id);
    const updated = await queryOne<{ id: string }>(
      `UPDATE public.site_pages SET ${assignments.join(", ")} WHERE id = $${params.length} RETURNING id`,
      params,
    );
    return updated ? this.findPageById(updated.id) : null;
  },

  // ----------------------------------------------------------- sections ----
  async findSectionById(id: string): Promise<SiteSection | null> {
    const row = await queryOne<SectionRow>(
      `SELECT ${SECTION_RETURNING} FROM public.site_sections WHERE id = $1`,
      [id],
    );
    return row ? mapSection(row) : null;
  },

  async updateSection(
    id: string,
    input: Partial<{
      title: string | null;
      subtitle: string | null;
      content: string | null;
      imageUrl: string | null;
      buttonText: string | null;
      buttonUrl: string | null;
      displayOrder: number;
      isVisible: boolean;
      settings: Record<string, unknown>;
    }>,
  ): Promise<SiteSection | null> {
    const columns: Record<string, string> = {
      title: "title",
      subtitle: "subtitle",
      content: "content",
      imageUrl: "image_url",
      buttonText: "button_text",
      buttonUrl: "button_url",
      displayOrder: "display_order",
      isVisible: "is_visible",
    };

    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      const value = (input as Record<string, unknown>)[key];
      if (value === undefined) continue;
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    }
    if (input.settings !== undefined) {
      params.push(JSON.stringify(input.settings));
      assignments.push(`settings = $${params.length}::jsonb`);
    }
    if (assignments.length === 0) return this.findSectionById(id);

    params.push(id);
    const row = await queryOne<SectionRow>(
      `UPDATE public.site_sections SET ${assignments.join(", ")}
       WHERE id = $${params.length}
       RETURNING ${SECTION_RETURNING}`,
      params,
    );
    return row ? mapSection(row) : null;
  },

  // ------------------------------------------------------- testimonials ----
  async listTestimonials(activeOnly: boolean): Promise<Testimonial[]> {
    const rows = await queryMany<{
      id: string;
      name: string;
      location: string;
      quote: string;
      rating: number | null;
      sort_order: number;
      is_active: boolean;
    }>(
      `SELECT id, name, location, quote, rating, sort_order, is_active
       FROM public.testimonials
       ${activeOnly ? "WHERE is_active = true" : ""}
       ORDER BY sort_order, created_at`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      location: r.location,
      quote: r.quote,
      rating: r.rating,
      sortOrder: r.sort_order,
      isActive: r.is_active,
    }));
  },

  async createTestimonial(input: {
    name: string;
    location?: string | undefined;
    quote: string;
    rating?: number | null | undefined;
    sortOrder?: number | undefined;
    isActive?: boolean | undefined;
  }): Promise<Testimonial> {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO public.testimonials (name, location, quote, rating, sort_order, is_active)
       VALUES ($1,$2,$3,$4,COALESCE($5,(SELECT COALESCE(max(sort_order),-1)+1 FROM public.testimonials)),$6)
       RETURNING id`,
      [
        input.name,
        input.location ?? "",
        input.quote,
        input.rating ?? null,
        input.sortOrder ?? null,
        input.isActive ?? true,
      ],
    );
    if (!row) throw new Error("Failed to create testimonial");
    const all = await this.listTestimonials(false);
    const created = all.find((t) => t.id === row.id);
    if (!created) throw new Error("Testimonial vanished after creation");
    return created;
  },

  async updateTestimonial(
    id: string,
    input: Partial<{
      name: string;
      location: string;
      quote: string;
      rating: number | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ): Promise<Testimonial | null> {
    const columns: Record<string, string> = {
      name: "name",
      location: "location",
      quote: "quote",
      rating: "rating",
      sortOrder: "sort_order",
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
    if (assignments.length === 0) {
      return (await this.listTestimonials(false)).find((t) => t.id === id) ?? null;
    }

    params.push(id);
    const updated = await queryOne<{ id: string }>(
      `UPDATE public.testimonials SET ${assignments.join(", ")} WHERE id = $${params.length} RETURNING id`,
      params,
    );
    if (!updated) return null;
    return (await this.listTestimonials(false)).find((t) => t.id === id) ?? null;
  },

  async deleteTestimonial(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.testimonials WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },

  // -------------------------------------------------------------- media ----
  async listMedia(): Promise<Array<{ id: string; type: string; name: string; url: string; createdAt: string }>> {
    const rows = await queryMany<{
      id: string;
      type: string;
      name: string;
      url: string;
      created_at: Date;
    }>("SELECT id, type, name, url, created_at FROM public.media_assets ORDER BY created_at DESC");
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      url: r.url,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  },

  async createMedia(input: { type: string; name: string; url: string }): Promise<{ id: string }> {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO public.media_assets (type, name, url) VALUES ($1,$2,$3)
       ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type
       RETURNING id`,
      [input.type, input.name, input.url],
    );
    if (!row) throw new Error("Failed to create media asset");
    return row;
  },

  async deleteMedia(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.media_assets WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },
};
