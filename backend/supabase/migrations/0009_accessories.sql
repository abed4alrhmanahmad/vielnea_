-- ===========================================================================
-- Vielinea — accessories
-- ---------------------------------------------------------------------------
-- Accessories are complementary / gift items, NOT clothing products. They are
-- deliberately their own entity rather than a `products` row with an
-- "accessories" category: they carry no sizes, no measurements, no model
-- details and no category, and they must never appear in the storefront's
-- product category/filter system.
--
-- Safe to run repeatedly: every statement is IF NOT EXISTS / idempotent.
-- Contains no DROP TABLE and no DELETE, so it will never destroy existing data.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- accessories
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accessories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  description  text NOT NULL DEFAULT '',
  price        numeric(10, 2) NOT NULL CHECK (price >= 0),
  discount     integer NOT NULL DEFAULT 0 CHECK (discount BETWEEN 0 AND 100),
  stock        integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  -- Availability is the admin's on/off switch. It is independent of stock so a
  -- temporarily sold-out accessory can stay listed, and a stocked one can be
  -- hidden without deleting it.
  is_available boolean NOT NULL DEFAULT true,
  is_featured  boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accessories_available_idx
  ON public.accessories (is_available, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS accessories_created_at_idx
  ON public.accessories (created_at DESC);

DROP TRIGGER IF EXISTS accessories_set_updated_at ON public.accessories;
CREATE TRIGGER accessories_set_updated_at
  BEFORE UPDATE ON public.accessories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- accessory_images
-- Multiple images per accessory, ordered by sort_order. image_url holds either
-- a Supabase Storage public URL (admin upload) or a path served by the
-- frontend, exactly like product_images.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accessory_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id uuid NOT NULL REFERENCES public.accessories (id) ON DELETE CASCADE,
  image_url    text NOT NULL,
  alt_text     text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accessory_images_unique_per_accessory UNIQUE (accessory_id, image_url)
);

CREATE INDEX IF NOT EXISTS accessory_images_accessory_id_idx
  ON public.accessory_images (accessory_id, sort_order);

-- --------------------------------------------------------------------------
-- Row Level Security: deny-by-default for the public API keys, matching every
-- other table. No policies, so anon/authenticated can reach nothing; the API
-- connects as a privileged role which bypasses RLS.
-- --------------------------------------------------------------------------
ALTER TABLE public.accessories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessory_images  ENABLE ROW LEVEL SECURITY;
