-- ---------------------------------------------------------------------------
-- 0015 — Payment method and payment status on orders.
--
-- Extends the existing orders table rather than adding a payments table: an
-- order has exactly one payment method and one payment state, so a separate
-- table would buy nothing.
--
--   payment_method : 'card' — settled immediately at checkout (existing flow)
--                    'cod'  — Cash on Delivery, collected by the courier
--   payment_status : 'pending' | 'paid'
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card';

-- Added with DEFAULT 'paid' so every order that already exists — all of which
-- were created by the immediate-settlement path and stored as status 'paid' —
-- is backfilled correctly in a single step. The going-forward default is then
-- switched to the safer 'pending'; checkout always writes both columns
-- explicitly, so the default is only a backstop.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid';

ALTER TABLE public.orders
  ALTER COLUMN payment_status SET DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('card', 'cod'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('pending', 'paid'));
  END IF;
END
$$;
