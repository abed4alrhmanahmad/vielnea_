-- ---------------------------------------------------------------------------
-- 0024 — Products can be saved as a draft.
--
-- The admin Products page has always shown a Published/Draft switch, but the
-- table had no column for it, so it was cosmetic: a "draft" product was
-- served to the public API exactly like a published one. A real draft is now
-- excluded from the public product list, category pages, search, every
-- homepage section, related-products, and the sitemap; its direct public URL
-- (GET /products/:id, GET /products/slug/:slug) 404s; and it cannot be added
-- to a cart or wishlist. Admin keeps full read/write access regardless of
-- this flag, and nothing about a draft's stock, images, sizes or category
-- assignment changes.
--
-- Additive and idempotent: every existing product stays published, so the
-- storefront's current catalogue is unaffected until an admin drafts one.
-- ---------------------------------------------------------------------------

-- The ALTER needs a brief exclusive lock. On Postgres 11+ adding a column with
-- a constant default is metadata-only (no table rewrite), so it is instant —
-- but if a long-running query already holds the table, the ALTER would wait
-- and every storefront read would queue behind it. lock_timeout makes it fail
-- fast instead (the runner rolls back; just re-run). SET LOCAL ends with this
-- migration's transaction.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
