-- ===========================================================================
-- Vielinea — initial schema
-- ---------------------------------------------------------------------------
-- Safe to run repeatedly: every statement is IF NOT EXISTS / idempotent.
-- Contains no DROP and no DELETE, so it will never destroy existing data.
--
-- Access model: the browser never talks to PostgreSQL. All reads and writes go
-- through the Express API using the `postgres` role. Row Level Security is
-- therefore enabled with NO policies on every table, which means the public
-- `anon` and `authenticated` keys can read nothing even if a key leaks. The
-- privileged roles the API uses bypass RLS.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Migration bookkeeping
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Shared helper: keep updated_at fresh
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- users
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness: emails are stored lowercased by the API, and
-- this index makes that guarantee hold at the database level too.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON public.users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users (role);

DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- categories
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  description text,
  image_url   text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS categories_sort_order_idx ON public.categories (sort_order);

DROP TRIGGER IF EXISTS categories_set_updated_at ON public.categories;
CREATE TRIGGER categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- products
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL CHECK (length(btrim(title)) > 0),
  description     text NOT NULL DEFAULT '',
  category_id     uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  price           numeric(10, 2) NOT NULL CHECK (price >= 0),
  discount        integer NOT NULL DEFAULT 0 CHECK (discount BETWEEN 0 AND 100),
  stock           integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  rating          numeric(2, 1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  review_count    integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  is_featured     boolean NOT NULL DEFAULT false,
  is_best_seller  boolean NOT NULL DEFAULT false,
  is_new_arrival  boolean NOT NULL DEFAULT false,
  has_gift        boolean NOT NULL DEFAULT false,
  model_height    text,
  model_weight    text,
  wearing_size    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products (category_id);
CREATE INDEX IF NOT EXISTS products_price_idx ON public.products (price);
CREATE INDEX IF NOT EXISTS products_rating_idx ON public.products (rating DESC);
CREATE INDEX IF NOT EXISTS products_created_at_idx ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS products_flags_idx
  ON public.products (is_new_arrival, is_best_seller, is_featured);

-- Case-insensitive substring search over title + description (?search=)
CREATE INDEX IF NOT EXISTS products_title_search_idx
  ON public.products USING gin (to_tsvector('simple', title || ' ' || description));

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- product_images
-- image_url holds a path served by the frontend, e.g. /images/products/x.jpg
-- The original asset files are never modified or removed.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  image_url  text NOT NULL,
  alt_text   text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_unique_per_product UNIQUE (product_id, image_url)
);

CREATE INDEX IF NOT EXISTS product_images_product_id_idx
  ON public.product_images (product_id, sort_order);

-- --------------------------------------------------------------------------
-- product_sizes  (per-size stock)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_sizes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  size       text NOT NULL,
  stock      integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT product_sizes_unique_per_product UNIQUE (product_id, size)
);

CREATE INDEX IF NOT EXISTS product_sizes_product_id_idx
  ON public.product_sizes (product_id, sort_order);

-- --------------------------------------------------------------------------
-- product_measurements
-- The numeric columns hold parsed standard dimensions. `labels` preserves the
-- exact ordered label/value map from the storefront ("Sleeve Length": "25 cm",
-- "Strap Drop": "22 cm", ...) so the product page renders byte-identical text.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_measurements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  size       text NOT NULL,
  bust       numeric(6, 2),
  waist      numeric(6, 2),
  hips       numeric(6, 2),
  length     numeric(6, 2),
  labels     jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT product_measurements_unique_per_size UNIQUE (product_id, size)
);

CREATE INDEX IF NOT EXISTS product_measurements_product_id_idx
  ON public.product_measurements (product_id);

-- --------------------------------------------------------------------------
-- wishlist_items
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlist_items_unique_per_user UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS wishlist_items_user_id_idx
  ON public.wishlist_items (user_id, created_at DESC);

-- --------------------------------------------------------------------------
-- cart_items
-- One row per (user, product, size). Prices are NOT stored here; they are read
-- from products at read/checkout time so the client can never set a price.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cart_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  size       text NOT NULL DEFAULT 'One Size',
  quantity   integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_unique_per_user UNIQUE (user_id, product_id, size)
);

CREATE INDEX IF NOT EXISTS cart_items_user_id_idx ON public.cart_items (user_id, created_at);

DROP TRIGGER IF EXISTS cart_items_set_updated_at ON public.cart_items;
CREATE TRIGGER cart_items_set_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- orders
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number  text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','processing','shipped','delivered','cancelled')),
  subtotal      numeric(10, 2) NOT NULL CHECK (subtotal >= 0),
  discount      numeric(10, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  shipping      numeric(10, 2) NOT NULL DEFAULT 0 CHECK (shipping >= 0),
  total         numeric(10, 2) NOT NULL CHECK (total >= 0),
  customer_name text NOT NULL,
  email         text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  address       text NOT NULL,
  city          text NOT NULL,
  postal_code   text,
  country       text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- order_items
-- Title/slug/image are denormalised so historical orders survive product edits.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  product_id    uuid REFERENCES public.products (id) ON DELETE SET NULL,
  product_title text NOT NULL,
  product_slug  text,
  image_url     text,
  size          text,
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    numeric(10, 2) NOT NULL CHECK (unit_price >= 0),
  total_price   numeric(10, 2) NOT NULL CHECK (total_price >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items (product_id);

-- --------------------------------------------------------------------------
-- reviews  (one review per user per product)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  user_id       uuid REFERENCES public.users (id) ON DELETE SET NULL,
  author_name   text NOT NULL,
  author_email  text,
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text NOT NULL DEFAULT '',
  verified      boolean NOT NULL DEFAULT false,
  helpful_count integer NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  reported      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_one_per_user_product UNIQUE (product_id, user_id)
);

CREATE INDEX IF NOT EXISTS reviews_product_id_idx ON public.reviews (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_rating_idx ON public.reviews (product_id, rating);

DROP TRIGGER IF EXISTS reviews_set_updated_at ON public.reviews;
CREATE TRIGGER reviews_set_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- contact_messages
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  subject    text,
  message    text NOT NULL,
  status     text NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON public.contact_messages (created_at DESC);

-- --------------------------------------------------------------------------
-- newsletter_subscribers
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  status        text NOT NULL DEFAULT 'subscribed'
                CHECK (status IN ('subscribed','unsubscribed')),
  source        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_lower_key
  ON public.newsletter_subscribers (lower(email));

DROP TRIGGER IF EXISTS newsletter_set_updated_at ON public.newsletter_subscribers;
CREATE TRIGGER newsletter_set_updated_at
  BEFORE UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security: deny-by-default for the public API keys.
-- No policies are created, so anon/authenticated can reach nothing. The API
-- connects as a privileged role which bypasses RLS.
-- --------------------------------------------------------------------------
ALTER TABLE public.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sizes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_measurements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
