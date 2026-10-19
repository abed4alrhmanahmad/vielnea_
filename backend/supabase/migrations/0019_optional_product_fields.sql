-- ---------------------------------------------------------------------------
-- 0019 — Make Title, Category and Price genuinely optional on products.
--
-- The admin panel must be able to create a product with any subset of
-- fields filled in (see the Admin Product Create/Edit fix). Three columns
-- currently reject an empty admin form:
--
--   - title       NOT NULL, CHECK (length(btrim(title)) > 0), no default
--   - category_id NOT NULL (FK to categories)
--   - price       NOT NULL, no default
--
-- title and price keep NOT NULL — every consuming query (product cards,
-- sorting, price filters, cart/checkout math) already assumes a string and
-- a number, never null. Instead they get the same "empty means the
-- column's own safe default" treatment discount/stock/rating/review_count
-- already use. Only the "must be non-empty" CHECK on title is dropped, so a
-- blank admin title is stored as '' rather than rejected outright.
--
-- category_id becomes nullable. Its FK constraint is unaffected — Postgres
-- foreign keys never evaluate NULL values, so "no category" and referential
-- integrity for a real category continue to coexist without touching
-- products_category_id_fkey.
--
-- Existing rows are untouched: every current product already has a
-- non-empty title, a real category and a real price, so none of these
-- relaxed rules change a single stored value.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ALTER COLUMN title SET DEFAULT '';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_title_check;

ALTER TABLE public.products
  ALTER COLUMN category_id DROP NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN price SET DEFAULT 0;
