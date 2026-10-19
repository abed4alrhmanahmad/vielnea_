-- ===========================================================================
-- CMS: editable pages and sections
-- ---------------------------------------------------------------------------
-- Completes the CMS structure started in 0005.
--
--   site_content   (0005)  key/value settings store — announcement, header nav,
--                          footer, social, contact, newsletter, SEO defaults
--   site_pages     (here)  one row per editable page, with SEO fields
--   site_sections  (here)  ordered, toggleable blocks belonging to a page
--   testimonials   (0005)  homepage praise quotes
--   media_assets   (0005)  media library references
--   store_settings (0005)  shipping/currency configuration
--
-- Additive only: no DROP, no DELETE. Existing tables and data are untouched.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.site_pages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  meta_title       text,
  meta_description text,
  og_title         text,
  og_description   text,
  og_image         text,
  is_published     boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_pages_published_idx ON public.site_pages (is_published);

DROP TRIGGER IF EXISTS site_pages_set_updated_at ON public.site_pages;
CREATE TRIGGER site_pages_set_updated_at
  BEFORE UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- site_sections
-- `settings` (jsonb) carries the per-section-type extras that would otherwise
-- need a column each — e.g. how many products a product row shows, or which
-- category slugs a featured-categories block lists. Everything with a fixed
-- meaning across section types gets a real column.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       uuid NOT NULL REFERENCES public.site_pages (id) ON DELETE CASCADE,
  section_key   text NOT NULL,
  section_type  text NOT NULL DEFAULT 'rich_text',
  title         text,
  subtitle      text,
  content       text,
  image_url     text,
  button_text   text,
  button_url    text,
  display_order integer NOT NULL DEFAULT 0,
  is_visible    boolean NOT NULL DEFAULT true,
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_sections_unique_key_per_page UNIQUE (page_id, section_key)
);

CREATE INDEX IF NOT EXISTS site_sections_page_order_idx
  ON public.site_sections (page_id, display_order);

DROP TRIGGER IF EXISTS site_sections_set_updated_at ON public.site_sections;
CREATE TRIGGER site_sections_set_updated_at
  BEFORE UPDATE ON public.site_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.site_pages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;
