-- ===========================================================================
-- Vielinea — make a selected image's Instagram URL optional
-- ---------------------------------------------------------------------------
-- The picture is still mandatory: a row with no image_url has nothing to show
-- in the marquee, so that column keeps its NOT NULL and its non-blank CHECK.
--
-- The link is not. The owner may want a picture in the strip without pointing
-- it at a specific post, so instagram_url becomes nullable. A tile with no URL
-- links to the Vielinea homepage instead — that fallback lives in the
-- storefront, not here, because it is a route ('/') and not data.
--
-- NULL means "no link". The empty string is deliberately NOT a second way to
-- say the same thing: it cannot satisfy the format CHECK below, so the API
-- normalises blank input to NULL and there is only one representation.
--
-- The CHECK is re-stated rather than dropped. In SQL a CHECK that evaluates to
-- NULL passes, so `instagram_url ~* '...'` already admits NULL once the column
-- is nullable, while still rejecting javascript:, data:, vbscript:, file: and
-- any non-Instagram host whenever a value IS supplied.
--
-- instagram_url remains NOT UNIQUE — several images pointing at the same post
-- is the core workflow (see 0020). Nothing here changes that.
--
-- Safe to run repeatedly: DROP NOT NULL is idempotent, and the constraint is
-- dropped before being re-added. No DROP TABLE, no DELETE, no data rewritten.
-- ===========================================================================

ALTER TABLE public.selected_images
  ALTER COLUMN instagram_url DROP NOT NULL;

-- Any row that somehow holds a blank string predates this change; collapse it
-- onto the single "no link" representation. A no-op on a clean database.
UPDATE public.selected_images
SET instagram_url = NULL
WHERE instagram_url IS NOT NULL AND btrim(instagram_url) = '';

ALTER TABLE public.selected_images
  DROP CONSTRAINT IF EXISTS selected_images_instagram_url_format;
ALTER TABLE public.selected_images
  ADD CONSTRAINT selected_images_instagram_url_format
  CHECK (
    instagram_url IS NULL
    OR instagram_url ~* '^https://(www\.)?instagram\.com/[^[:space:]]*$'
  );
