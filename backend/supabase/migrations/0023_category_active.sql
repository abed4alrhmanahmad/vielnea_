-- ---------------------------------------------------------------------------
-- 0023 — Categories can be switched off.
--
-- The admin Categories page has always shown an Enable/Disable switch, but the
-- table had no column for it, so the switch did nothing. A disabled category
-- is left out of the storefront's category list — the shop filter, homepage
-- category cards and the sitemap — and its /categories/:slug lookup 404s,
-- while its products, and every product link, keep working. Header/footer
-- links are CMS-managed and edited separately. Admin still lists it.
--
-- Additive and idempotent: every existing category stays enabled.
-- ---------------------------------------------------------------------------

-- The ALTER needs a brief exclusive lock. On Postgres 11+ adding a column with
-- a constant default is metadata-only (no table rewrite), so it is instant —
-- but if a long-running query already holds the table, the ALTER would wait
-- and every storefront read would queue behind it. lock_timeout makes it fail
-- fast instead (the runner rolls back; just re-run). SET LOCAL ends with this
-- migration's transaction.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
