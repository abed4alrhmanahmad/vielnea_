-- ===========================================================================
-- Reconcile the content/ops tables whose migration file is missing
-- ---------------------------------------------------------------------------
-- schema_migrations records a version '0005_content_and_ops' that created
--   site_content, store_settings, testimonials, media_assets
-- but that .sql file is not present in this repository. On the live database
-- those tables already exist; on a fresh clone they would never be created.
--
-- This migration restores their definitions so the repo alone can rebuild the
-- schema. Every statement is IF NOT EXISTS / additive, so running it against
-- the existing database is a no-op that changes no data.
--
-- (chat_threads / chat_messages from the same missing file are already
-- reconciled by 0006_live_chat.sql.)
-- ===========================================================================

-- --------------------------------------------------------------------------
-- site_content — key/document settings store used by the CMS for announcement,
-- header navigation, footer, social links, contact details, newsletter copy
-- and SEO defaults.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_content (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS site_content_set_updated_at ON public.site_content;
CREATE TRIGGER site_content_set_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- store_settings — single row (id pinned to 1). Authoritative shipping rules:
-- the cart preview and checkout both read these rather than hardcoding them.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  id                       integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name               text NOT NULL DEFAULT 'Vielinea',
  store_email              text NOT NULL DEFAULT 'hello@vielinea.com',
  store_phone              text NOT NULL DEFAULT '',
  store_address            text NOT NULL DEFAULT '',
  currency                 text NOT NULL DEFAULT 'USD',
  free_shipping_threshold  numeric(10, 2) NOT NULL DEFAULT 100 CHECK (free_shipping_threshold >= 0),
  standard_shipping        numeric(10, 2) NOT NULL DEFAULT 15 CHECK (standard_shipping >= 0),
  social_instagram         text NOT NULL DEFAULT '',
  social_facebook          text NOT NULL DEFAULT '',
  social_twitter           text NOT NULL DEFAULT '',
  updated_at               timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS store_settings_set_updated_at ON public.store_settings;
CREATE TRIGGER store_settings_set_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- testimonials — homepage praise quotes
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.testimonials (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  location   text NOT NULL DEFAULT '',
  quote      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT testimonials_unique_name_quote UNIQUE (name, quote)
);

CREATE INDEX IF NOT EXISTS testimonials_active_idx ON public.testimonials (is_active, sort_order);

DROP TRIGGER IF EXISTS testimonials_set_updated_at ON public.testimonials;
CREATE TRIGGER testimonials_set_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ratings were not part of the original shape; the admin testimonial editor
-- exposes one, so add it additively.
ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS rating integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'testimonials_rating_check') THEN
    ALTER TABLE public.testimonials
      ADD CONSTRAINT testimonials_rating_check
      CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- media_assets — media library. Stores references to files that already exist
-- under frontend/public; no image bytes are held in PostgreSQL.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_assets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL DEFAULT 'product'
             CHECK (type IN ('product', 'hero', 'banner', 'category')),
  name       text NOT NULL,
  url        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_unique_url UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS media_assets_type_idx ON public.media_assets (type, created_at DESC);

ALTER TABLE public.site_content   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets   ENABLE ROW LEVEL SECURITY;
