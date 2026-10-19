-- ===========================================================================
-- Vielinea — company timeline ("Our Story") for the About page
-- ---------------------------------------------------------------------------
-- Two pieces, deliberately separate:
--
--   1. `company_timeline` — the milestone entries themselves.
--   2. A `timeline` row in `site_sections` on the `about` page — the
--      feature-level on/off switch, plus the section's heading copy.
--
-- The switch reuses the CMS rather than introducing a second settings system:
-- `GET /site/pages/:slug` already filters out sections whose `is_visible` is
-- false, and `PUT /admin/site/sections/:id` already toggles it. Turning the
-- feature off therefore hides the whole section while leaving every row in
-- `company_timeline` untouched — the entries come back when it is switched on.
--
-- Individual entries have their own `is_active`, which is a different control:
-- it hides one milestone, not the feature.
--
-- Safe to run repeatedly: every statement is IF NOT EXISTS / ON CONFLICT, and
-- the seed only fires when the table is empty. No DROP TABLE, no DELETE.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- company_timeline
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_timeline (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Text, not an integer: the admin may want "2002", "2015—2018" or "Today".
  year          text NOT NULL CHECK (length(btrim(year)) > 0),
  title         text NOT NULL CHECK (length(btrim(title)) > 0),
  description   text NOT NULL DEFAULT '',
  -- Optional. Either a Supabase Storage public URL from the shared product
  -- image upload endpoint, or a path served by the frontend. NULL means the
  -- entry simply renders without an image.
  image_url     text,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Serves the public read: active entries in timeline order.
CREATE INDEX IF NOT EXISTS company_timeline_active_order_idx
  ON public.company_timeline (is_active, display_order, created_at);

-- Serves the admin read: every entry, in timeline order.
CREATE INDEX IF NOT EXISTS company_timeline_order_idx
  ON public.company_timeline (display_order, created_at);

DROP TRIGGER IF EXISTS company_timeline_set_updated_at ON public.company_timeline;
CREATE TRIGGER company_timeline_set_updated_at
  BEFORE UPDATE ON public.company_timeline
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security: deny-by-default for the public API keys, matching every
-- other table. No policies, so anon/authenticated can reach nothing; the API
-- connects as a privileged role which bypasses RLS.
-- --------------------------------------------------------------------------
ALTER TABLE public.company_timeline ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- The feature switch + heading, as a normal CMS section on the About page.
-- `is_visible` defaults to true so the section is live once seeded; the admin
-- can switch it off at any time without touching the entries.
-- --------------------------------------------------------------------------
INSERT INTO public.site_sections
  (page_id, section_key, section_type, subtitle, title, content, display_order, is_visible)
SELECT p.id, 'timeline', 'timeline',
       'Milestones',
       'Our Journey',
       'Milestones that shaped the house, told in our own words.',
       5, true
FROM public.site_pages p
WHERE p.slug = 'about'
ON CONFLICT (page_id, section_key) DO NOTHING;

-- --------------------------------------------------------------------------
-- Seed — placeholder milestones so the section renders as soon as it is
-- switched on. These are examples for the admin to edit or delete, not real
-- company history. Guarded on the table being empty, so admin edits and
-- deletions are never resurrected.
-- --------------------------------------------------------------------------
INSERT INTO public.company_timeline (year, title, description, display_order, is_active)
SELECT *
FROM (
  VALUES
    (
      '2002',
      'The House Is Founded',
      'Vielinea begins as a single atelier with a simple brief: fewer pieces, made better.',
      1,
      true
    ),
    (
      '2009',
      'The First Atelier Opens',
      'A dedicated workroom lets the house take cutting, finishing and fittings fully in hand.',
      2,
      true
    ),
    (
      '2016',
      'Considered Materials',
      'Every fabric is traced to its mill, and small-batch production becomes the standard.',
      3,
      true
    ),
    (
      '2024',
      'Beyond the Atelier',
      'The collection reaches a wider audience online, without changing how any of it is made.',
      4,
      true
    )
) AS seed (year, title, description, display_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.company_timeline);
