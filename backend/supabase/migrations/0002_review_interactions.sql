-- ===========================================================================
-- Review interactions: per-user "helpful" votes.
-- ---------------------------------------------------------------------------
-- The storefront's reviews panel already had a per-user Helpful toggle, so the
-- vote needs to be attributable to a user rather than a bare counter. The
-- denormalised reviews.helpful_count is kept in sync by trigger.
--
-- Idempotent, additive, no DROP of any data-bearing object.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.review_helpful_votes (
  review_id  uuid NOT NULL REFERENCES public.reviews (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS review_helpful_votes_user_idx
  ON public.review_helpful_votes (user_id);

-- Keep reviews.helpful_count equal to the number of vote rows.
CREATE OR REPLACE FUNCTION public.sync_review_helpful_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid := COALESCE(NEW.review_id, OLD.review_id);
BEGIN
  UPDATE public.reviews r
  SET helpful_count = (
    SELECT count(*) FROM public.review_helpful_votes v WHERE v.review_id = target
  )
  WHERE r.id = target;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS review_helpful_votes_sync ON public.review_helpful_votes;
CREATE TRIGGER review_helpful_votes_sync
  AFTER INSERT OR DELETE ON public.review_helpful_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_review_helpful_count();

ALTER TABLE public.review_helpful_votes ENABLE ROW LEVEL SECURITY;
