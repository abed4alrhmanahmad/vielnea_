# Vielinea

Timeless luxury fashion storefront — a full-stack application.

```
Vielinea/
├── frontend/    React 19 · TypeScript · Vite · TanStack Start/Router/Query · Tailwind 4
└── backend/     Node · Express · TypeScript · REST API · Supabase PostgreSQL
```

```
React frontend  ──►  Express REST API  ──►  Supabase PostgreSQL
   :8080                  :5000/api
```

The browser never talks to the database. Express owns authentication,
authorisation, validation, pricing, stock and order calculation; Supabase is the
persistence layer.

---

## Quick start

Two terminals.

**1 — API**

```bash
cd backend
npm install
cp .env.example .env      # fill in DATABASE_URL and JWT_SECRET
npm run db:check          # verify Supabase access (writes nothing)
npm run db:migrate        # create the schema
npm run db:seed           # load the catalogue
npm run dev               # http://localhost:5000
```

**2 — Storefront**

```bash
cd frontend
npm install
npm run dev               # http://localhost:8080
```

`frontend/.env.local` needs one line, and it holds no secrets:

```
VITE_API_URL=http://localhost:5000/api
```

### Demo accounts

| Email | Password | Role |
| --- | --- | --- |
| `demo@vielinea.com` | `123456` | customer |
| _your_ `ADMIN_EMAIL` | _your_ `ADMIN_PASSWORD` | admin |

The admin account is created by `npm run db:seed` from the `ADMIN_EMAIL` and
`ADMIN_PASSWORD` values in `backend/.env` — it has no built-in default, so set
them before seeding. Never commit those values.

---

## Where the secrets live

| Value | Location | Exposed to browser |
| --- | --- | --- |
| `DATABASE_URL` | `backend/.env` | never |
| `JWT_SECRET` | `backend/.env` | never |
| `PAYMENT_PROVIDER` | `backend/.env` | never — no provider is configured yet |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env` | never |
| `EMAIL_API_KEY` | `backend/.env` | never |
| `VITE_API_URL` | `frontend/.env.local` | yes — it is just a URL |

`backend/.env` is gitignored. No Supabase credential, database password or JWT
secret appears anywhere in `frontend/`, in any `VITE_*` variable, in `public/`,
or in this repository's history.

---

## Scripts

**Frontend** (`cd frontend`)

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on :8080 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

**Backend** (`cd backend`)

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch-mode API on :5000 |
| `npm run build` | Type-check and compile |
| `npm start` | Run the compiled server |
| `npm run db:check` | Verify Supabase access — non-destructive |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed the catalogue (idempotent) |
| `npm run db:verify` | Read-only data verification |
| `npm run test:all` | Storefront + admin + live chat + guest chat + customer account + COD + card + accessories suites (server must be running) |
| `npm run test:accessories` | Accessories end-to-end: admin CRUD, image upload to Supabase Storage, and the separation from products |
| `npm run test:chat` | Live chat end-to-end, including realtime and authorisation |
| `npm run test:account` | Customer account end-to-end: orders, order status, wishlist, chat, profile, cross-customer isolation |
| `npm run test:cod` | Cash on Delivery end-to-end: COD and card checkout, validation, admin settlement, customer visibility |
| `npm run test:card` | Visa / Card end-to-end: authorization, decline, provider error, idempotency, and that no raw card data is stored |
| `npm run test:guest-chat` | Anonymous guest chat: identity assignment, isolation between guests, admin visibility, authenticated chat unaffected |
| `npm run test:order-email` | Admin new-order email: content, escaping, the exact Resend request (no network) and that a mail failure never breaks checkout |

---

## How the frontend gets its data

| Surface | Source |
| --- | --- |
| Home, Shop, Product details, related products | `GET /api/products` |
| Category filter | `GET /api/categories` |
| Accessories page (`/accessories`) | `GET /api/accessories` — a separate entity from products |
| Cart | `GET/POST/PUT/DELETE /api/cart` (localStorage while signed out) |
| Wishlist | `/api/wishlist` (localStorage while signed out) |
| Login / Register / Session | `/api/auth/*` |
| Customer account (`/account`, orders, order detail, wishlist, messages, profile) | `/api/orders`, `/api/wishlist`, `/api/chat/*`, `/api/auth/me` |
| Checkout and orders | `/api/orders` — `paymentMethod` is `card` or `cod`; card also sends a provider token |
| Product reviews | `/api/products/:id/reviews` |
| Contact form | `POST /api/contact` |
| Newsletter | `POST /api/newsletter` |
| Live chat (customer widget) | `/api/chat/*` + SSE push on `/api/chat/stream` |
| Live chat (admin panel) | `/api/admin/chat/*` + the same SSE stream |
| Admin: products, categories, orders, customers, reviews, stats | `/api/admin/*`, `/api/products` |
| Admin: accessories | `/api/accessories` (admin-only writes) |

The admin panel at `/admin` signs in through the same `/api/auth/login` and is
accepted only for accounts with the `admin` role. Every admin endpoint enforces
authentication **and** the admin role server-side — a customer token receives
403, an anonymous request 401.

### Customer account

`/account`, `/account/orders`, `/account/orders/:id`, `/account/wishlist`,
`/account/messages` and `/account/profile` sit behind the storefront session.
Signed-out visitors are sent to `/login?redirect=<where they were going>` and
returned there after signing in. That guard is a convenience only: every
customer endpoint scopes its rows by the `user_id` in the verified JWT, so one
customer's order id, conversation or wishlist is a 404 for anybody else.

Order status is read straight from `orders.status`; the account pages never
decide it. An admin change on `/admin/orders` is what the customer sees.

`frontend/src/data/products.ts` is retained as the record of where the seed data
came from; the running storefront no longer reads from it for product content.

All API access goes through `frontend/src/lib/api/client.ts` and the hooks in
`frontend/src/services/` — no component calls `fetch` directly.

### Accessories

Accessories are complementary / gift items and are **not** products. They live
in their own `accessories` table, are managed from their own admin section at
`/admin/accessories`, and are shown on their own storefront page at
`/accessories` — the page the Accessories item in the navbar opens. They have no
category, no sizes and no measurements, and they never appear in the product
catalogue or its category filter. Their images go through the same admin upload
into the same Supabase Storage bucket as product images.

### Images

Product and brand images were **copied** into `frontend/public/images/` so the
database can reference stable paths (`/images/products/product-dress.jpg`). The
originals in `frontend/src/assets/` are untouched and still used by the hero and
logo components. No image was deleted, overwritten or replaced.

---

## Design system

Unchanged. Primary `#5B2C6F`, dark purple `#4A235A`, background `#FAF6F0`,
warm beige `#F4EBDD`, borders `#E9DED0`, text `#2D2D2D` / `#6B6B6B`;
Playfair Display and Inter.

---

## Documentation

Full API reference, database schema, migration and seeding detail, and the
Supabase IPv6/pooler gotcha are in [backend/README.md](backend/README.md).
