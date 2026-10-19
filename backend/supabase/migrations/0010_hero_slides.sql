-- ===========================================================================
-- Vielinea — homepage hero slides
-- ---------------------------------------------------------------------------
-- Turns the single CMS `hero` section into an ordered, admin-managed carousel.
--
-- The storefront reads only active rows, ordered by display_order, so the
-- admin can reorder or hide a slide without deleting it. `image_url` holds
-- either a Supabase Storage public URL (admin upload, same bucket and same
-- upload endpoint as product images) or a path served by the frontend —
-- exactly like product_images and accessory_images.
--
-- The existing `site_sections` hero row is deliberately left in place: it
-- still backs the admin Homepage screen's SEO/section list, and slide 1 below
-- is seeded from it so the hero that already shipped is preserved verbatim.
--
-- Safe to run repeatedly: every statement is IF NOT EXISTS / idempotent, and
-- the seed only fires when the table is completely empty, so admin edits and
-- deletions are never resurrected. Contains no DROP TABLE and no DELETE.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- hero_slides
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hero_slides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url     text NOT NULL CHECK (length(btrim(image_url)) > 0),
  eyebrow_text  text NOT NULL DEFAULT '',
  heading       text NOT NULL CHECK (length(btrim(heading)) > 0),
  description   text NOT NULL DEFAULT '',
  button_text   text NOT NULL DEFAULT '',
  button_link   text NOT NULL DEFAULT '/shop',
  -- Controls carousel order. Not unique: the admin swaps values when
  -- reordering, which would trip a unique constraint mid-swap.
  display_order integer NOT NULL DEFAULT 0,
  -- The admin's show/hide switch, independent of deletion.
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Serves the public read: active slides in carousel order.
CREATE INDEX IF NOT EXISTS hero_slides_active_order_idx
  ON public.hero_slides (is_active, display_order, created_at);

-- Serves the admin read: every slide, in carousel order.
CREATE INDEX IF NOT EXISTS hero_slides_order_idx
  ON public.hero_slides (display_order, created_at);

DROP TRIGGER IF EXISTS hero_slides_set_updated_at ON public.hero_slides;
CREATE TRIGGER hero_slides_set_updated_at
  BEFORE UPDATE ON public.hero_slides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security: deny-by-default for the public API keys, matching every
-- other table. No policies, so anon/authenticated can reach nothing; the API
-- connects as a privileged role which bypasses RLS.
-- --------------------------------------------------------------------------
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- Seed — the three initial slides.
--
-- Guarded on the table being empty, so this runs once and never overwrites or
-- duplicates what the admin has since changed.
--
-- Slide 1 reproduces the hero that already shipped, copy for copy, including
-- its image (/images/brand/vielinea-hero.jpg). `heading` keeps the newline
-- that the homepage splits into two display lines.
-- --------------------------------------------------------------------------
INSERT INTO public.hero_slides
  (image_url, eyebrow_text, heading, description, button_text, button_link, display_order, is_active)
SELECT *
FROM (
  VALUES
    (
      '/images/brand/vielinea-hero.jpg',
      'New Collection',
      E'Timeless\nElegance',
      'Discover our latest collection made for modern women.',
      'Shop Now',
      '/shop',
      1,
      true
    ),
    (
      '/images/brand/vielinea-hero-2.jpg',
      'Autumn Atelier',
      E'Quiet\nLuxury',
      'Fluid silhouettes in silk and satin, cut for the everyday extraordinary.',
      'Explore the Edit',
      '/shop',
      2,
      true
    ),
    (
      '/images/brand/vielinea-hero-3.jpg',
      'Evening Collection',
      E'After\nDark',
      'Bias-cut gowns that move like liquid light, for occasions worth remembering.',
      'Shop Evening',
      '/shop',
      3,
      true
    )
) AS seed (
  image_url, eyebrow_text, heading, description, button_text, button_link, display_order, is_active
)
WHERE NOT EXISTS (SELECT 1 FROM public.hero_slides);
