-- ===========================================================================
-- Vielinea — admin-selected images for the homepage Instagram marquee
-- ---------------------------------------------------------------------------
-- Replaces the marquee's hardcoded image list with rows the admin manages.
--
-- THE UNIT HERE IS ONE IMAGE, NOT ONE INSTAGRAM POST.
--
-- Each row is a single picture the owner chose to show, together with the
-- Instagram post it should link to. There is deliberately no parent "post"
-- table and no grouping: if the owner publishes a carousel of four pictures on
-- Instagram and wants three of them on the site, that is three independent
-- rows which happen to carry the same instagram_url.
--
--   image_url = image-a.jpg   instagram_url = .../p/POST_A/
--   image_url = image-b.jpg   instagram_url = .../p/POST_A/
--   image_url = image-c.jpg   instagram_url = .../p/POST_A/
--   image_url = image-d.jpg   instagram_url = .../p/POST_B/
--
-- instagram_url therefore MUST NOT be unique — see the column comment below.
--
-- Nothing here talks to Instagram. The URL is only a link destination; the
-- picture shown on Vielinea is the one the admin uploaded, stored exactly like
-- product, accessory and hero images (same bucket, same upload endpoint).
--
-- Modelled on hero_slides (0010): same id/timestamp conventions, same
-- display_order + is_active pair, same index shape, same updated_at trigger,
-- same deny-by-default RLS.
--
-- Ships with no rows: the marquee hides itself until the admin adds the first
-- image, so nothing invented ends up on the homepage.
--
-- Safe to run repeatedly: every statement is IF NOT EXISTS / idempotent.
-- Contains no DROP TABLE and no DELETE.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- selected_images
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.selected_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The picture shown in the marquee: a Supabase Storage public URL from the
  -- shared product-image upload endpoint, or a path served by the frontend.
  -- Same convention as product_images, accessory_images and hero_slides.
  image_url     text NOT NULL CHECK (length(btrim(image_url)) > 0),
  -- Where clicking this picture sends the visitor.
  --
  -- NOT UNIQUE, ON PURPOSE. Several selected images routinely point at the
  -- same Instagram post, because that post was a carousel the owner picked
  -- more than one picture from. A unique constraint here would break the
  -- core workflow, so there must never be one.
  instagram_url text NOT NULL,
  -- Controls marquee order. Not unique: the admin swaps values when
  -- reordering, which would trip a unique constraint mid-swap.
  display_order integer NOT NULL DEFAULT 0,
  -- The admin's show/hide switch, independent of deletion.
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Last line of defence for the link destination, behind the API's Zod schema.
-- The value is rendered into an href, so anything that is not a plain https
-- Instagram URL is refused outright — javascript:, data:, vbscript: and file:
-- cannot satisfy this pattern. Deliberately permissive about the path so that
-- /p/, /reel/, /tv/ and profile links all pass.
ALTER TABLE public.selected_images
  DROP CONSTRAINT IF EXISTS selected_images_instagram_url_format;
ALTER TABLE public.selected_images
  ADD CONSTRAINT selected_images_instagram_url_format
  CHECK (instagram_url ~* '^https://(www\.)?instagram\.com/[^[:space:]]*$');

-- Serves the public read: active images in marquee order.
CREATE INDEX IF NOT EXISTS selected_images_active_order_idx
  ON public.selected_images (is_active, display_order, created_at);

-- Serves the admin read: every image, in marquee order.
CREATE INDEX IF NOT EXISTS selected_images_order_idx
  ON public.selected_images (display_order, created_at);

DROP TRIGGER IF EXISTS selected_images_set_updated_at ON public.selected_images;
CREATE TRIGGER selected_images_set_updated_at
  BEFORE UPDATE ON public.selected_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security: deny-by-default for the public API keys, matching every
-- other table. No policies, so anon/authenticated can reach nothing; the API
-- connects as a privileged role which bypasses RLS.
-- --------------------------------------------------------------------------
ALTER TABLE public.selected_images ENABLE ROW LEVEL SECURITY;
