-- ===========================================================================
-- Review moderation status
-- ---------------------------------------------------------------------------
-- The admin reviews screen already offered pending / approved / hidden states
-- with no column to store them. This adds one.
--
-- Default is 'approved' so existing and newly submitted reviews keep appearing
-- on the storefront exactly as they do today; moderation is opt-in hiding.
-- Additive only — no DROP, no DELETE.
-- ===========================================================================

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reviews_status_check'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_status_check
      CHECK (status IN ('pending', 'approved', 'hidden'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reviews_status_idx ON public.reviews (product_id, status);
