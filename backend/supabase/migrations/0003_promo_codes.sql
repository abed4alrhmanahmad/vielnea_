-- ===========================================================================
-- Promo codes
-- ---------------------------------------------------------------------------
-- Additive only: creates two new tables and adds nullable columns to orders.
-- Contains no DROP TABLE and no DELETE, so existing products, categories,
-- images, reviews and orders are untouched.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL,
  description           text,
  discount_type         text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  -- percentage: 1-100. fixed: a currency amount.
  discount_value        numeric(10, 2) NOT NULL CHECK (discount_value > 0),
  minimum_order_amount  numeric(10, 2) NOT NULL DEFAULT 0 CHECK (minimum_order_amount >= 0),
  -- Caps a percentage discount. NULL = uncapped.
  maximum_discount      numeric(10, 2) CHECK (maximum_discount IS NULL OR maximum_discount > 0),
  -- 0 / NULL = unlimited redemptions.
  usage_limit           integer CHECK (usage_limit IS NULL OR usage_limit >= 0),
  used_count            integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  once_per_customer     boolean NOT NULL DEFAULT false,
  starts_at             timestamptz,
  expires_at            timestamptz,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- A percentage discount can never exceed 100%.
  CONSTRAINT promo_codes_percentage_range
    CHECK (discount_type <> 'percentage' OR discount_value <= 100)
);

-- Codes are compared case-insensitively, so uniqueness must be too.
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_upper_key
  ON public.promo_codes (upper(code));

CREATE INDEX IF NOT EXISTS promo_codes_active_idx ON public.promo_codes (is_active, expires_at);

DROP TRIGGER IF EXISTS promo_codes_set_updated_at ON public.promo_codes;
CREATE TRIGGER promo_codes_set_updated_at
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Redemptions: one row per successful use. Backs both the usage limit and the
-- once-per-customer rule, and keeps used_count honest via trigger.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_code_redemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id  uuid NOT NULL REFERENCES public.promo_codes (id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  order_id       uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  discount_applied numeric(10, 2) NOT NULL DEFAULT 0 CHECK (discount_applied >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promo_code_redemptions_code_idx
  ON public.promo_code_redemptions (promo_code_id);
CREATE INDEX IF NOT EXISTS promo_code_redemptions_user_idx
  ON public.promo_code_redemptions (promo_code_id, user_id);

CREATE OR REPLACE FUNCTION public.sync_promo_used_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target uuid := COALESCE(NEW.promo_code_id, OLD.promo_code_id);
BEGIN
  UPDATE public.promo_codes p
  SET used_count = (
    SELECT count(*) FROM public.promo_code_redemptions r WHERE r.promo_code_id = target
  )
  WHERE p.id = target;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS promo_code_redemptions_sync ON public.promo_code_redemptions;
CREATE TRIGGER promo_code_redemptions_sync
  AFTER INSERT OR DELETE ON public.promo_code_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_promo_used_count();

-- --------------------------------------------------------------------------
-- Record the applied code on the order. Nullable and additive: existing rows
-- keep their current values.
-- --------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.promo_codes (id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code text;

-- Discount already existed as the product-level saving; this separates the two
-- so the order can report each independently.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_discount numeric(10, 2) NOT NULL DEFAULT 0
    CHECK (promo_discount >= 0);

ALTER TABLE public.promo_codes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;
