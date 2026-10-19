-- ===========================================================================
-- Vielinea — per-slide hero focal point
-- ---------------------------------------------------------------------------
-- The hero frame is much wider than the photographs it shows (roughly 2.2:1
-- against 3:2 and 16:9 sources), so `object-fit: cover` has to discard a
-- sizeable band of image height. Centred cropping took that band off the top
-- and cut the models' heads.
--
-- `object_position` is the CSS value used for that crop, stored per slide so
-- the focal point can be tuned per photograph from the admin panel instead of
-- in code. It defaults to 'top', which anchors the crop to the top edge and
-- keeps faces whole.
--
-- Safe to run repeatedly: ADD COLUMN IF NOT EXISTS, and the backfill only
-- touches rows that are still NULL/blank.
-- ===========================================================================

ALTER TABLE public.hero_slides
  ADD COLUMN IF NOT EXISTS object_position text NOT NULL DEFAULT 'top';

-- Guards the inline style this value ends up in: keywords, percentages and
-- lengths only — no punctuation that could carry extra CSS declarations.
ALTER TABLE public.hero_slides
  DROP CONSTRAINT IF EXISTS hero_slides_object_position_format;
ALTER TABLE public.hero_slides
  ADD CONSTRAINT hero_slides_object_position_format
  CHECK (object_position ~ '^[A-Za-z0-9%. -]{1,40}$');

-- Existing rows created before this column keep the safe default.
UPDATE public.hero_slides
SET object_position = 'top'
WHERE object_position IS NULL OR btrim(object_position) = '';
