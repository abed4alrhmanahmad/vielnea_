-- ---------------------------------------------------------------------------
-- 0008 — keep products.rating and products.review_count derived from reviews.
--
-- Both columns existed from 0001 but nothing ever wrote to them after seeding,
-- so a product card could advertise "4.9 · 210 reviews" while the reviews panel
-- on the same page listed none, and posting a real review moved neither number.
--
-- The aggregate excludes hidden reviews, matching what the public reviews
-- endpoint returns, so admin moderation moves the product rating too.
-- Re-runnable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_product_rating(target uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.products p
     SET rating = COALESCE(agg.average, 0),
         review_count = COALESCE(agg.total, 0)
    FROM (
      SELECT round(avg(rating)::numeric, 2) AS average,
             count(*)::int                  AS total
        FROM public.reviews
       WHERE product_id = target
         AND status <> 'hidden'
    ) agg
   WHERE p.id = target;
$$;

CREATE OR REPLACE FUNCTION public.reviews_sync_product_rating()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- On UPDATE the review can be moved between products, so refresh both sides.
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.sync_product_rating(OLD.product_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.sync_product_rating(NEW.product_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reviews_sync_product_rating ON public.reviews;
CREATE TRIGGER reviews_sync_product_rating
  AFTER INSERT OR UPDATE OF rating, status, product_id OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.reviews_sync_product_rating();

-- Backfill so the stored values agree with the reviews that actually exist.
UPDATE public.products p
   SET rating = COALESCE(agg.average, 0),
       review_count = COALESCE(agg.total, 0)
  FROM (
    SELECT p2.id,
           round(avg(r.rating) FILTER (WHERE r.status <> 'hidden')::numeric, 2) AS average,
           count(r.id) FILTER (WHERE r.status <> 'hidden')::int                 AS total
      FROM public.products p2
      LEFT JOIN public.reviews r ON r.product_id = p2.id
     GROUP BY p2.id
  ) agg
 WHERE p.id = agg.id
   AND (p.rating <> COALESCE(agg.average, 0) OR p.review_count <> COALESCE(agg.total, 0));
