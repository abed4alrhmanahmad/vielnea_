-- ---------------------------------------------------------------------------
-- 0016 — Safe card-payment metadata on orders.
--
-- Extends the existing orders table; no new payment table. Only the three
-- values a merchant is permitted to retain are stored:
--
--   payment_reference : the provider's transaction id, for reconciliation and
--                       refunds. Not a secret, safe to show an admin.
--   card_brand        : "visa", "mastercard", ...
--   card_last4        : the last four digits, the standard safe remnant.
--
-- The card number and the CVV are NEVER stored, never logged, and never reach
-- the API — the provider's client-side SDK tokenizes them in the browser and
-- only the token travels. There is deliberately no column for either, and the
-- CHECK below keeps card_last4 to four digits so a full PAN cannot be written
-- into it by mistake.
--
-- All three are NULL for Cash on Delivery orders and for every order that
-- predates this migration.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS card_brand        text,
  ADD COLUMN IF NOT EXISTS card_last4        text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_card_last4_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_card_last4_check
      CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$');
  END IF;
END
$$;
