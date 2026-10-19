# Vielinea API

Express + TypeScript REST API for the Vielinea storefront, backed by Supabase PostgreSQL.

```
React frontend  ──►  Express REST API  ──►  Supabase PostgreSQL
   (browser)            (this app)            (managed Postgres)
```

The browser never talks to Supabase. Every read and write goes through this API,
which owns authentication, authorisation, validation, pricing, stock and order
calculations. Supabase is used purely as the database.

---

## Project structure

```
backend/
├── src/
│   ├── config/env.ts            Zod-validated environment, fails fast on boot
│   ├── lib/
│   │   ├── db.ts                pg Pool, query helpers, withTransaction()
│   │   ├── errors.ts            AppError hierarchy (operational vs unexpected)
│   │   └── http.ts              { success, data } envelope + asyncHandler
│   ├── middleware/
│   │   ├── auth.ts              authenticate / optionalAuthenticate / authorizeAdmin
│   │   ├── error.ts             central error handler, 404 handler
│   │   ├── rate-limit.ts        general / auth / write limiters
│   │   └── validate.ts          Zod request validation
│   ├── schemas/index.ts         All request schemas in one place
│   ├── repositories/            SQL only — no business rules
│   ├── services/                Business logic (pricing, stock, checkout)
│   ├── controllers/             HTTP in, HTTP out
│   ├── routes/index.ts          Route table
│   ├── types/                   Shared API + domain types
│   ├── app.ts                   Express app assembly
│   └── server.ts                Listener + graceful shutdown
├── scripts/
│   ├── check.ts                 Non-destructive access verification
│   ├── migrate.ts               Applies pending SQL migrations
│   ├── seed.ts                  Idempotent catalogue seed
│   └── verify.ts                Read-only data verification
├── supabase/
│   ├── migrations/              Versioned SQL, tracked in schema_migrations
│   └── seed/catalog.ts          Seed source data
├── .env                         Real secrets (gitignored)
└── .env.example                 Placeholders
```

---

## Setup

```bash
cd backend
npm install
cp .env.example .env     # then fill in the values (see below)
npm run db:check         # verify access before touching anything
npm run db:migrate       # create tables
npm run db:seed          # load the catalogue
npm run db:verify        # confirm what landed
npm run dev              # http://localhost:5000
```

`npm run db:setup` runs migrate + seed + verify in sequence.

### Environment variables

All of these live in `backend/.env` and **never** in the frontend.

| Variable | Required | Notes |
| --- | --- | --- |
| `PORT` | no | Defaults to `5000` |
| `NODE_ENV` | no | `development` \| `test` \| `production` |
| `FRONTEND_URL` | no | CORS origin, defaults to `http://localhost:8080`. Comma-separate for several |
| `SUPABASE_URL` | **yes** | `https://<ref>.supabase.co` — public identifier |
| `DB_HOST` | **yes**\* | Pooler hostname |
| `DB_PORT` | no | Defaults to `5432` |
| `DB_USER` | **yes**\* | `postgres.<project-ref>` |
| `DB_PASSWORD` | **yes**\* | **Secret.** Passed verbatim — no encoding needed |
| `DB_NAME` | no | Defaults to `postgres` |
| `DATABASE_URL` | no\* | Fallback if the `DB_*` fields are not set. **Secret** |
| `SUPABASE_SERVICE_ROLE_KEY` | no | **Secret.** Not needed — the API uses Postgres directly |
| `SUPABASE_ANON_KEY` | no | Public key, unused by this API |
| `JWT_SECRET` | **yes** | **Secret.** Minimum 32 characters |
| `JWT_EXPIRES_IN` | no | Defaults to `7d` |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | no | Seeded demo customer |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Seeded admin account |

\* Provide **either** the discrete `DB_HOST` / `DB_USER` / `DB_PASSWORD` fields
(preferred) **or** a single `DATABASE_URL`. The discrete form is preferred
because a URL forces the password through percent-encoding, and not every
connection-string parser decodes it back — a password containing `$` or `%` then
authenticates as the wrong string and fails with a misleading
"password authentication failed". Passing it as a plain field avoids that.

> **Never** put `DB_PASSWORD`, `DATABASE_URL`, `JWT_SECRET` or
> `SUPABASE_SERVICE_ROLE_KEY` in the frontend, in a `VITE_*` variable, in
> `public/`, or in this README.

### Connecting to Supabase from an IPv4-only network

`db.<project-ref>.supabase.co` resolves to **IPv6 only**. On a network without an
IPv6 route every connection to it fails with a generic "can't reach database
server", which looks exactly like a wrong password. Use the **pooler** host
instead, which is dual-stack:

- Session pooler, port `5432` — migrations and DDL
- Transaction pooler, port `6543` — runtime queries (append `?pgbouncer=true`)
- The username is `postgres.<project-ref>`, not plain `postgres`

To find the right pooler region, connect with a deliberately wrong password:

- `Tenant or user not found` → wrong region/instance, try another
- `password authentication failed` → **right host**, wrong password

For this project the tenant is on `aws-0-ap-northeast-1.pooler.supabase.com`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Watch-mode server via tsx |
| `npm run build` | Type-checks and compiles to `dist/` |
| `npm start` | Runs the compiled server |
| `npm run typecheck` | Types only, no emit |
| `npm run db:check` | Verifies connection / read / write / migration rights. Writes nothing |
| `npm run db:inspect` | Read-only listing of schemas, tables and extensions |
| `npm run db:migrate` | Applies pending migrations, records them in `schema_migrations` |
| `npm run db:seed` | Seeds the catalogue. Idempotent |
| `npm run db:verify` | Read-only checks on seeded data |
| `npm run db:verify-images` | Confirms every stored image path resolves to a real file |
| `npm run test:e2e` | 70-assertion storefront API test against a running server |
| `npm run test:admin` | Admin panel test against a running server |
| `npm run test:accessories` | 56-assertion accessories test: admin CRUD, real image upload to Supabase Storage, authorisation, and the separation from products |
| `npm run test:all` | All suites in sequence |
| `npm run db:final-check` | Connection, migrations, counts and a rolled-back write proof |
| `npm run db:cleanup-tests` | Removes leftover `e2e-*` / `E2E*` test rows only |

`test:e2e` requires the API to be running (`npm run dev` in another terminal).
It creates a temporary user, cart, order, review, contact message and newsletter
subscription, asserts on them, then deletes exactly those rows and restores the
stock its checkout consumed. Seeded products and categories are never modified.

`db:check` is safe to run at any time: its write probe happens inside a
transaction that is always rolled back, and it never drops or deletes anything.

---

## Database schema

| Table | Purpose |
| --- | --- |
| `users` | Accounts. `password_hash` only, bcrypt, never plaintext |
| `categories` | Eight storefront categories |
| `products` | Catalogue with price, discount, stock, rating, flags, model info |
| `product_images` | Ordered images, paths into the frontend's `public/images/` |
| `product_sizes` | Per-size stock |
| `product_measurements` | Garment measurements (see note below) |
| `accessories` | Complementary / gift items. A separate entity from products — no category, no sizes, no measurements |
| `accessory_images` | Ordered images for an accessory; cascades on delete |
| `wishlist_items` | Unique per (user, product) |
| `cart_items` | Unique per (user, product, size). Holds **no prices** |
| `orders` | Order header with server-calculated totals |
| `order_items` | Line items, denormalised so history survives product edits |
| `reviews` | One per (product, user), rating 1–5, moderation `status` |
| `review_helpful_votes` | Per-user "helpful" votes; keeps `helpful_count` in sync |
| `contact_messages` | Contact form submissions |
| `newsletter_subscribers` | Unique on lowercased email |
| `chat_threads` | One live-chat conversation per customer or guest; at most one `open` each |
| `chat_messages` | Chat transcript, `sender` customer/admin, `read_at` for unread state |

**Measurements.** The storefront renders an ordered label/value map whose keys
vary per product (`Sleeve Length`, `Strap Drop`, `Chain Length`, `Inseam`…).
Forcing that into fixed columns would lose data, so the table has both: the
standard `bust` / `waist` / `hips` / `length` numeric columns for querying, and a
`labels` jsonb column preserving the exact original map that the product page
displays.

**Accessories.** Accessories are complementary gift items, not clothing, so
they are their own entity rather than a `products` row with an "accessories"
category. They carry no category, sizes, measurements, model details, rating or
reviews, and nothing in the product read path joins to them — which is what
keeps them out of the storefront's category and filter system. They are managed
in their own admin section (`/admin/accessories`) and shown on their own
storefront page (`/accessories`). Accessory images share the `product-images`
Supabase Storage bucket, so there is one upload pipeline to configure.

**Row Level Security** is enabled on every table with **no policies**, so the
public `anon` key can read nothing even if it leaks. The API connects with a
privileged role that bypasses RLS.

### Migrations

Every schema change is a numbered file in `supabase/migrations/`, applied in
filename order and recorded in `schema_migrations`. Files are written to be
re-runnable (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO UPDATE`) and contain
no `DROP TABLE` or `DELETE`, so running them against a populated database is
safe.

| File | Contents |
| --- | --- |
| `0001_init.sql` | All core tables, indexes, constraints, triggers, RLS |
| `0002_review_interactions.sql` | `review_helpful_votes` + count-sync trigger |
| `0003_promo_codes.sql` | Historical — the promo-code feature has since been removed |
| `0004_review_moderation.sql` | `reviews.status` (pending / approved / hidden) |
| `0015_order_payment_method.sql` | `orders.payment_method` and `orders.payment_status` |
| `0016_card_payment_metadata.sql` | `orders.payment_reference`, `card_brand`, `card_last4` |
| `0017_guest_chat.sql` | Anonymous guest threads: `guest_token_hash`, `anonymous_number` |
| `0018_chat_email_unique_excludes_guests.sql` | Narrows the email-uniqueness rule so guests (empty email) don't collide |
| `0014_remove_free_delivery.sql` | Drops the free-shipping threshold and the copy that promised it |

### Seed

`npm run db:seed` loads the catalogue from `supabase/seed/catalog.ts`, which is a
faithful transcription of the storefront's original mock data — the same twelve
products, prices, discounts, stock, ratings, images, sizes, measurements and
model information. Nothing was invented.

It is idempotent: every write is an upsert keyed on a stable slug or email, so
repeated runs converge rather than duplicating. Existing user passwords are
never reset by a re-seed.

Product stock is distributed across sizes so the per-size totals sum to the
product-level figure instead of multiplying inventory.

Seeded accounts:

| Email | Password | Role |
| --- | --- | --- |
| `demo@vielinea.com` | `123456` | customer |
| _your_ `ADMIN_EMAIL` | _your_ `ADMIN_PASSWORD` | admin |

The admin row is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env`.
Neither has a default, so seeding fails fast rather than creating an account
with a password that is public knowledge. Use a strong, unique password and keep
it out of version control.

---

## API reference

Base URL `http://localhost:5000/api`.

**Success**

```json
{ "success": true, "data": { }, "pagination": { } }
```

**Failure** — stack traces are never sent to the client.

```json
{ "success": false, "message": "Something went wrong", "errors": [] }
```

Authenticated requests send `Authorization: Bearer <token>`. The token is also
set as an httpOnly cookie on login/register.

### Health

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | — |
| GET | `/health/db` | — |

### Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | `{ name, email, password }` |
| POST | `/auth/login` | — | `{ email, password }` |
| GET | `/auth/me` | user | |
| PUT | `/auth/me` | user | `{ name, email }` — edits the caller's own profile; the id comes from the token, never the body. Returns a re-issued token because the email is part of the payload. 409 if the address belongs to another account |
| PUT | `/auth/password` | user | `{ currentPassword, newPassword }` — 401 if the current password is wrong |
| POST | `/auth/logout` | — | Clears the cookie |

### Products

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/products` | — |
| GET | `/products/:id` | — |
| GET | `/products/slug/:slug` | — |
| GET | `/products/:id/related` | — |
| POST | `/products` | **admin** |
| PUT | `/products/:id` | **admin** |
| DELETE | `/products/:id` | **admin** |

`:id` accepts either a UUID or a slug.

`GET /products` query parameters:

| Param | Example |
| --- | --- |
| `search` | `?search=dress` — matches title or description |
| `category` | `?category=dresses` |
| `minPrice` / `maxPrice` | `?minPrice=100&maxPrice=200` (compares discounted price) |
| `sort` | `newest`, `oldest`, `price_asc`, `price_desc`, `rating`, `title_asc`, `title_desc` (also accepts `price-asc` / `price-desc`) |
| `page` / `limit` | `?page=1&limit=12` (limit max 60) |
| `gift`, `newArrival`, `bestSeller`, `featured`, `inStock` | boolean flags |

Filters combine. Responses include `pagination` with `total`, `page`, `limit`,
`totalPages`, `hasPrevPage`, `hasNextPage`.

### Accessories

Complementary / gift items. A **separate entity from products**, in their own
`accessories` table, with no category, no sizes and no measurements. They never
appear in `/products` or in the product category filter.

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/accessories` | — |
| GET | `/accessories/:id` | — |
| POST | `/accessories` | **admin** |
| POST | `/accessories/images` | **admin** |
| PUT | `/accessories/:id` | **admin** |
| DELETE | `/accessories/:id` | **admin** |

`:id` accepts either a UUID or a slug. The slug is derived from the name and
de-duplicated automatically, so two accessories may share a name.

`GET /accessories` query parameters:

| Param | Example |
| --- | --- |
| `search` | `?search=ribbon` — matches name or description |
| `minPrice` / `maxPrice` | `?minPrice=10&maxPrice=50` (compares discounted price) |
| `sort` | `newest`, `oldest`, `price_asc`, `price_desc`, `name_asc`, `name_desc`, `manual` (default: admin display order) |
| `page` / `limit` | `?page=1&limit=24` (limit max 60) |
| `featured`, `inStock` | boolean flags |
| `availability` | `available` (default), `hidden`, `all` — the admin panel passes `all` |

Only `is_available` accessories are returned unless `availability` says
otherwise, so hiding one takes it off the storefront without deleting it.

`POST /accessories/images` takes the **raw image bytes** with a `Content-Type`
of `image/jpeg`, `image/png` or `image/webp` — the same contract as
`POST /products/images`, and the same Supabase Storage bucket. It returns
`{ url }`, which the caller then submits as an `images[].imageUrl`.

### Categories

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/categories` | — |
| GET | `/categories/:id` | — |

### Cart — all authenticated

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/cart` | Returns items, count, subtotal, discount, total |
| POST | `/cart` | `{ productId, size, quantity }` |
| POST | `/cart/merge` | Adopts a guest cart on sign-in |
| PUT | `/cart/:productId` | `{ size, quantity }`; quantity `0` removes |
| DELETE | `/cart/:productId?size=M` | Omit `size` to remove every size |
| DELETE | `/cart` | Clears the bag |

Prices are always read from the database. Quantities are validated against
per-size stock.

### Wishlist — all authenticated

| Method | Path |
| --- | --- |
| GET | `/wishlist` |
| POST | `/wishlist` |
| POST | `/wishlist/toggle` |
| POST | `/wishlist/merge` |
| POST | `/wishlist/move-to-cart` |
| DELETE | `/wishlist/:productId` |

### Orders — all authenticated

| Method | Path |
| --- | --- |
| POST | `/orders` |
| GET | `/orders` |
| GET | `/orders/:id` |

Order creation runs in a single transaction with the product rows locked
`FOR UPDATE`: it reads the cart, verifies products and stock, reads real prices,
calculates subtotal / discount / shipping / total, writes the order and its
items, decrements stock and clears the cart. **No total, price or quantity is
taken from the request body** — the body carries delivery details and the chosen
payment method only.

Shipping is a flat `store_settings.standard_shipping` ($15 by default) on every
order.

#### Payment method

`POST /orders` accepts `paymentMethod`, one of `card` or `cod`. Anything else is
a 422. It defaults to `card`, so a client that sends no payment method behaves
exactly as it did before Cash on Delivery existed.

| `paymentMethod` | Order `status` | `paymentStatus` | At checkout |
| --- | --- | --- | --- |
| `card` | `paid` | `paid` | Only after the payment provider authorizes the amount |
| `cod` | `pending` | `pending` | Nothing is collected; no card details are asked for |

A card payment also requires a `card` object — `{ token, brand, last4,
expiryMonth, expiryYear }` — minted by the provider's client-side SDK. The
schema is `.strict()`, so a request carrying a raw card number or CVV is
rejected with a 422 rather than having the field silently dropped. An optional
`idempotencyKey` makes a retry or a double-click safe.

Authorization happens inside the order transaction, before any row is written.
A decline returns **402** and a provider failure **503**; in both cases the
transaction rolls back, so no order exists, no stock moves and the customer
keeps their bag.

The server decides both resulting states from the validated method. A
`paymentStatus`, `status` or `total` in the request body is ignored, and a COD
order can only be settled afterwards by an admin through
`PUT /admin/orders/:id/payment-status`.

A customer can only read their own orders; admins can read any.

### Reviews

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/products/:productId/reviews` | optional |
| POST | `/products/:productId/reviews` | user |
| POST | `/products/:productId/reviews/:reviewId/helpful` | user |
| POST | `/products/:productId/reviews/:reviewId/report` | user |
| DELETE | `/products/:productId/reviews/:reviewId` | owner or admin |

Ratings are 1–5. Posting twice updates the existing review rather than erroring.
`verified` is derived from the user's order history and cannot be set by the
client. When the request is authenticated, each review carries
`viewerHasVotedHelpful`.

### Admin

Every route below requires an authenticated **admin**. Customers receive 403,
anonymous callers 401.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/stats` | Dashboard aggregates, top products, 30-day revenue |
| GET | `/admin/orders` | All orders (`page`, `limit`, `status`, `search`) |
| GET | `/admin/orders/:id` | Order detail |
| PUT/PATCH | `/admin/orders/:id/status` | Update order status |
| PUT/PATCH | `/admin/orders/:id/payment-status` | Settle a payment — `pending` / `paid` |
| GET | `/admin/customers` | Users with order counts and totals |
| GET | `/admin/reviews` | All reviews with product titles, for moderation |
| PUT | `/admin/reviews/:id` | Update rating / comment / status / reported |
| DELETE | `/admin/reviews/:id` | Delete a review |
| POST | `/admin/categories` | Create a category |
| PUT | `/admin/categories/:id` | Update a category |
| DELETE | `/admin/categories/:id` | Delete (409 if products still reference it) |

Product create/update/delete use the admin-guarded `/products` routes above.

Reviews with `status = 'hidden'` are excluded from the storefront entirely —
list, count and rating distribution.

### Contact and newsletter

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/contact` | — |
| POST | `/newsletter` | — |

No email is sent; submissions are stored. Subscribing twice is not an error — the
response reports `alreadySubscribed`.

### Live chat

Customer side — every route authenticated and scoped to the caller.

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/chat/stream` | customer/admin — SSE push stream |
| GET | `/chat/unread` | customer |
| GET | `/chat/conversations` | customer |
| POST | `/chat/conversations` | customer — idempotent |
| GET | `/chat/conversations/:id/messages` | customer, owner only |
| POST | `/chat/conversations/:id/messages` | customer, owner only |
| PATCH | `/chat/conversations/:id/read` | customer, owner only |
| PATCH | `/chat/messages/:id/read` | customer, owner only |

Guest side — the only chat routes, and the only customer-facing routes anywhere
in the API, reachable with **no session at all**.

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/chat/guest/stream` | guest token — SSE push stream |
| POST | `/chat/guest/conversations` | none — creates or resumes |
| GET | `/chat/guest/conversations/:id/messages` | guest token, owner only |
| POST | `/chat/guest/conversations/:id/messages` | guest token, owner only |
| PATCH | `/chat/guest/conversations/:id/read` | guest token, owner only |

Admin side — all require the `admin` role.

| Method | Path |
| --- | --- |
| GET | `/admin/chat/unread` |
| GET | `/admin/chat/conversations` |
| GET | `/admin/chat/conversations/:id/messages` |
| POST | `/admin/chat/conversations/:id/messages` |
| PATCH | `/admin/chat/conversations/:id/read` |
| PATCH | `/admin/chat/messages/:id/read` |

`POST /chat/conversations` returns the customer's existing open conversation if
they have one, so the widget resumes the same thread after a refresh rather than
creating duplicates. A customer touching a conversation they do not own receives
**404** — the same response a missing id produces, so the endpoint cannot be used
to probe which conversation ids exist.

#### Anonymous guest chat

A visitor with no account can open the widget and chat immediately — no name, no
email, no login. `POST /chat/guest/conversations` with no `X-Guest-Token` header
creates a thread, allocates a display number from `chat_anonymous_number_seq`
("Anonymous 17"), and returns a random 256-bit token **once**. The browser keeps
only that token (`localStorage`) and sends it back as `X-Guest-Token` on every
later request, including the same start call — which is how the same visitor
resumes the same thread and keeps the same number after a reload, rather than
becoming a new "Anonymous" on every visit.

The token is the entire guest identity. Only its SHA-256 hash is ever stored
(`chat_threads.guest_token_hash`), so the database holds nothing that grants
access on its own. Every guest route re-derives ownership from the presented
token; a conversation id by itself is never sufficient, and a guest reaching for
someone else's id — or for an authenticated customer's thread, or for any
`/admin/*` or `/chat/*` (non-guest) route — gets exactly the same **404** an
account holder does for a thread they don't own. The display number, the thread
and the "guest" flag are all decided by the server; nothing in the request body
can set, override, or promote them (`POST /chat/guest/conversations` ignores any
`anonymousNumber`, `customerName` or `userId` a client sends).

Guest writes run through the same `writeLimiter`, the same message schema (1–2000
characters, trimmed) and the same sanitisation as every other chat message — no
protection is relaxed to allow anonymous access. This is also the only surface
in the app that accepts writes with no authentication at all; every other
endpoint (`authenticate`/`authorizeAdmin`) is unchanged.

Guest threads reuse `chat_threads` and `chat_messages` — there is no second chat
table. A thread is either an account's (`user_id` set) or a guest's
(`guest_token_hash` + `anonymous_number` set); the `chat_threads_identity_check`
constraint enforces that a row is never both or neither. An admin sees a guest
thread's `customerName` as `"Anonymous N"` with `customerEmail` empty and
`isGuest: true` on the conversation payload — an authenticated customer's thread
is completely unaffected and still shows their real name and email.

**Real-time.** Delivery is a genuine server push, not polling. An `AFTER INSERT`
trigger on `chat_messages` calls `pg_notify('vielinea_chat', …)`; the API holds a
`LISTEN` connection (`src/lib/chat-bus.ts`) and fans each event out to the owning
customer and to every connected admin over SSE. Messages are also published
inline by the writing request and deduplicated by id, so delivery does not depend
on the listener being attached at that instant. The only timer in the path is a
25-second SSE keepalive comment, which carries no chat data.

Supabase Realtime is deliberately **not** used from the browser. It authorises
subscriptions with RLS evaluated against a Supabase Auth JWT, and Vielinea issues
its own JWTs against a custom `public.users` table — there is no `auth.uid()` for
a policy to match, so RLS could not scope a customer to their own thread.
Subscribing from the browser would mean shipping the anon key with permissive
policies (every customer able to read every other customer's messages) or running
a second parallel auth system. The database still drives delivery via
LISTEN/NOTIFY, and Express remains the only component holding credentials.

`LISTEN` requires a session that survives between statements, so it uses the
session pooler on port 5432 — it does not work through the transaction pooler on
6543.

---

## Admin order notifications

When a customer's checkout succeeds, the backend emails the VIELINEA admin that
a new order has arrived.

```
POST /api/orders  ->  orderService.checkout()
                        transaction: stock, order, items, cart cleared
                      COMMIT
                        -> sendNewOrderNotification(order)   [fire-and-forget]
```

The send happens **after** the transaction commits, so a notification can never
describe an order that was rolled back. It is not awaited and cannot reject:
notifying the shop is not part of placing an order, so a mail outage never slows
down or fails a customer's checkout — the failure is logged and the order still
returns 201.

The email carries the order number, order ID, customer name, contact and
shipping details, the line items, the totals and the payment method. `Reply-To`
is set to the customer, so replying from the alert reaches the buyer. Every
interpolated value is HTML-escaped — the name, address and notes are free text
from the checkout form.

### Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `EMAIL_API_KEY` | Resend API key. Unset = notifications skipped | unset |
| `EMAIL_FROM` | Verified sender address | `VIELINEA <onboarding@resend.dev>` |
| `ORDER_NOTIFICATION_EMAIL` | Recipient of the alert | falls back to `ADMIN_EMAIL` |

All three are server-side only and never reach the browser. `backend/.env` is
gitignored; no email credential appears in `frontend/`, in any `VITE_*`
variable, or in this repository.

The provider is chosen by presence rather than by name: set `EMAIL_API_KEY` and
Resend is used, leave it unset and each notification is skipped with a log line.
That default keeps checkout fully working on an instance with no mail account.

```
[email] order notification sent for VLN-20260924-0484
[email] skipped (provider disabled): "New VIELINEA Order VLN-..." -> admin@example.com
[email] order notification failed for VLN-20260924-0484: Resend responded 401: ...
```

### Structure

```
src/services/email/
  provider.ts              EmailProvider interface + EmailDeliveryError
  resend.provider.ts       Resend adapter over its REST API
  disabled.provider.ts     no-op default when nothing is configured
  index.ts                 resolves the adapter from configuration
  order-notification.ts    the new-order template and sender
```

This mirrors `src/services/payment/`: one interface, a real adapter selected by
configuration, an honest default when there is no account. No SDK dependency is
added — Resend's send endpoint is a single authenticated POST and this backend
runs on Node >= 20, where `fetch` is global.

Adding a different provider: implement `EmailProvider` and return it from
`resolve()` in `src/services/email/index.ts`.

`npm run test:order-email` verifies the message content, the escaping of hostile
customer input, the exact request sent to Resend (fetch stubbed, no network) and
that a 401 or a dropped connection never propagates to checkout.

---

## Security

- **Helmet** sets security headers; `x-powered-by` is disabled
- **CORS** allows only the configured frontend origin(s), with credentials
- **bcrypt** (10 rounds) for passwords; the login path compares against a dummy
  hash on unknown emails so timing does not reveal which addresses exist
- **JWT** signed with `JWT_SECRET`, issuer-checked on verify
- **Zod** validates every request body, query and parameter
- **Rate limiting** — tight on auth, moderate on public writes, generous on reads
- **Parameterised SQL** everywhere; no string interpolation of user input
- **RLS** enabled with no policies as defence in depth
- Central error handler maps known failures and returns a generic 500 otherwise,
  never leaking stack traces or schema details
- Request bodies capped at 100 kB

---

## Notes and current limitations

- **The admin panel** under `frontend/src/admin/` is API-backed for products,
  categories, orders, customers, reviews and dashboard statistics.
  Its remaining screens — notifications, chat, media library, homepage/site
  content and store settings — are content-management features with no backend
  counterpart in this scope and still use localStorage. They are self-contained
  and do not affect storefront data.
- **Guest carts** live in localStorage and are merged into the account on
  sign-in via `/cart/merge` and `/wishlist/merge`.
- **No payment provider is configured.** VIELINEA has no processor account, so
  by default `PAYMENT_PROVIDER=unconfigured` and a card payment is refused with
  a 503 — no card is charged and no order is ever marked paid on a promise.
  Cash on Delivery is unaffected and remains a fully working way to order.

  Card payment is expressed as an interface in `src/services/payment/`, so
  going live is one adapter and one setting:

  1. Add `src/services/payment/<name>.provider.ts` implementing
     `CardPaymentProvider.authorize()` against the processor's SDK.
  2. Register it in `src/services/payment/index.ts` and add its name to the
     `PAYMENT_PROVIDER` enum in `src/config/env.ts`.
  3. Set `PAYMENT_PROVIDER=<name>` plus the processor's **secret key** in
     `backend/.env`, and its **publishable key** as a `VITE_`-prefixed variable
     in `frontend/.env.local`.
  4. Replace `tokenizeCard()` in `frontend/src/lib/payments/card.ts` with the
     processor's client-side tokenization call. Its return shape is already
     what the API expects, so nothing else changes.

  `PAYMENT_PROVIDER=sandbox` is a local stand-in for development and the test
  suite. **It moves no money** — it approves and declines from the standard
  test card numbers so the checkout path can be exercised — and it is refused
  outright when `NODE_ENV=production`.

- **Card data never reaches this server.** The card number and CVV are
  tokenized in the browser and are not fields on any API schema, so they cannot
  be logged or stored. Only the provider reference, the brand and the last four
  digits are persisted (migration `0016`), which is the standard safe remnant.
