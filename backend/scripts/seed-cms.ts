/**
 * Seeds the CMS with the site's existing content.
 *
 * Idempotent: settings and pages are upserted by key/slug, sections by
 * (page, section_key), testimonials by (name, quote). Re-running converges —
 * and by design it does NOT overwrite edits an admin has already made, except
 * for structural fields. See `--force` to reset content back to the seed.
 */
import pg from "pg";
import { env } from "../src/config/env.js";
import { seedPages, seedSettings, seedTestimonials } from "../supabase/seed/cms.js";

const force = process.argv.includes("--force");

async function main(): Promise<void> {
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-seed-cms",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  console.log(`Seeding CMS${force ? " (force: overwriting existing content)" : ""}...\n`);

  try {
    await client.query("BEGIN");

    // ---------------------------------------------------------------- settings
    for (const [key, value] of Object.entries(seedSettings)) {
      await client.query(
        force
          ? `INSERT INTO public.site_content (key, value) VALUES ($1, $2::jsonb)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
          : `INSERT INTO public.site_content (key, value) VALUES ($1, $2::jsonb)
             ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value)],
      );
      console.log(`  setting   ${key}`);
    }

    // -------------------------------------------------------- store settings
    await client.query(
      `INSERT INTO public.store_settings (id, store_name, store_email, store_phone, store_address)
       VALUES (1, 'Vielinea', 'hello@vielinea.com', '+1 (555) 010-2200', '12 Rue Saint-Honoré, Paris')
       ON CONFLICT (id) DO NOTHING`,
    );
    console.log(`  store_settings row ensured`);

    // ------------------------------------------------------------ testimonials
    let testimonialsAdded = 0;
    for (const t of seedTestimonials) {
      const { rowCount } = await client.query(
        `INSERT INTO public.testimonials (name, location, quote, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name, quote) DO NOTHING`,
        [t.name, t.location, t.quote, t.sortOrder],
      );
      testimonialsAdded += rowCount ?? 0;
    }
    console.log(
      `\n  testimonials ${testimonialsAdded} inserted, ${seedTestimonials.length - testimonialsAdded} already present`,
    );

    // ------------------------------------------------------------------ pages
    for (const page of seedPages) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO public.site_pages
           (slug, title, meta_title, meta_description, og_title, og_description, og_image)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (slug) DO UPDATE
           SET title = ${force ? "EXCLUDED.title" : "public.site_pages.title"}
         RETURNING id`,
        [
          page.slug,
          page.title,
          page.metaTitle,
          page.metaDescription,
          page.ogTitle ?? null,
          page.ogDescription ?? null,
          page.ogImage ?? null,
        ],
      );
      const pageId = rows[0]?.id;
      if (!pageId) throw new Error(`Failed to upsert page ${page.slug}`);

      for (const s of page.sections) {
        await client.query(
          force
            ? `INSERT INTO public.site_sections
                 (page_id, section_key, section_type, title, subtitle, content, image_url,
                  button_text, button_url, display_order, is_visible, settings)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
               ON CONFLICT (page_id, section_key) DO UPDATE
                 SET section_type = EXCLUDED.section_type,
                     title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
                     content = EXCLUDED.content, image_url = EXCLUDED.image_url,
                     button_text = EXCLUDED.button_text, button_url = EXCLUDED.button_url,
                     display_order = EXCLUDED.display_order,
                     is_visible = EXCLUDED.is_visible, settings = EXCLUDED.settings`
            : `INSERT INTO public.site_sections
                 (page_id, section_key, section_type, title, subtitle, content, image_url,
                  button_text, button_url, display_order, is_visible, settings)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
               ON CONFLICT (page_id, section_key) DO NOTHING`,
          [
            pageId,
            s.sectionKey,
            s.sectionType,
            s.title ?? null,
            s.subtitle ?? null,
            s.content ?? null,
            s.imageUrl ?? null,
            s.buttonText ?? null,
            s.buttonUrl ?? null,
            s.displayOrder,
            s.isVisible ?? true,
            JSON.stringify(s.settings ?? {}),
          ],
        );
      }
      console.log(`  page      /${page.slug.padEnd(9)} ${page.sections.length} sections`);
    }

    await client.query("COMMIT");
    console.log("\nCMS seed complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nCMS seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
