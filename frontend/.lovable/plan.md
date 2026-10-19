# Vielinea Admin Dashboard — Build Plan

Frontend-only admin dashboard layered on top of the existing customer site. No backend changes, no design system changes. All CRUD via a service layer backed by localStorage + seed mock data, so it can later be swapped for Supabase/Express.

## Architecture

**Service layer (`src/admin/services/`)** — each domain has a service exposing `list / get / create / update / remove` plus domain-specific ops. Every service reads/writes through a small `storage.ts` helper (`getJSON(key, seed)`, `setJSON(key, value)`). Swapping to real APIs later = replacing service internals only.

**Mock seeds (`src/admin/mock/`)** — orders, customers, coupons, reviews, chat threads, notifications, analytics, site content. Products/categories reuse existing `src/data/products.ts`.

**Site content bridge** — new `src/admin/services/site-content.ts` owns announcement bar, hero (title/subtitle/CTA/image), section titles, featured/new/best/gifts selections, about, contact, footer, socials, newsletter. A `useSiteContent()` hook (localStorage + storage event) is consumed by existing `Header`, `index.tsx`, `Footer`, `about`, `contact` — minimal edits, no visual change when values match current defaults.

**Auth** — `src/admin/services/admin-auth.ts` with a hard-coded credential pair (since replaced by real backend authentication), stores `{ email, loggedInAt }` in localStorage. `_adminAuth` pathless layout route guards everything under `/admin` except `/admin/login`, redirects unauth to login.

## Routes (all under `src/routes/`)

- `admin.login.tsx` — centered login card, Vielinea styling
- `_adminAuth.tsx` — pathless guard + `AdminShell` (sidebar + topbar + breadcrumbs + `<Outlet />`)
- `_adminAuth.admin.index.tsx` — Dashboard: KPI cards, revenue line chart, orders bar chart (recharts, already in stack), recent orders table, best sellers
- `_adminAuth.admin.products.tsx` — table (search/filter/sort), row actions, drawer/dialog for add/edit with images list (reorder + main), sizes, stock, discount, description, featured toggle, publish toggle, model height/wearing size, per-size garment measurements. No color field.
- `_adminAuth.admin.categories.tsx` — list with image, enable toggle, drag-reorder (simple up/down buttons)
- `_adminAuth.admin.orders.tsx` — orders table + detail dialog with status dropdown (Pending/Processing/Delivered/Cancelled)
- `_adminAuth.admin.customers.tsx` — list, search, detail dialog (orders, spend, wishlist)
- `_adminAuth.admin.inventory.tsx` — stock table, inline qty edit, low-stock + OOS filters
- `_adminAuth.admin.homepage.tsx` — sections list (Featured / New Arrivals / Best Sellers / Gifts / Accessories placeholders), reorder + enable, pick products per section, preview link
- `_adminAuth.admin.content.tsx` — tabs: Announcement, Hero, About, Contact, Footer, Social, Newsletter — form + preview
- `_adminAuth.admin.media.tsx` — grid of mock images grouped by type; upload = data-URL into localStorage; delete
- `_adminAuth.admin.coupons.tsx` — CRUD table with active toggle
- `_adminAuth.admin.reviews.tsx` — list with approve/hide/delete
- `_adminAuth.admin.chat.tsx` — two-pane: thread list + message view + composer; mock "agent typing" + unread badges + online dot
- `_adminAuth.admin.analytics.tsx` — charts: daily/monthly revenue, top/bottom products, most-viewed, low-stock
- `_adminAuth.admin.notifications.tsx` — feed grouped by type, mark read/all-read
- `_adminAuth.admin.settings.tsx` — store info, contact, socials, shipping thresholds, admin profile

## Shared admin UI (`src/admin/components/`)

`AdminShell`, `AdminSidebar` (collapsible via shadcn Sidebar), `AdminTopbar` (search, notifications popover, profile menu), `Breadcrumbs`, `StatCard`, `DataTable` (thin wrapper: header, search, pagination), `ConfirmDialog`, `EmptyState`, `ImageUploader` (data URL).

## Design

Uses only existing tokens (`bg-background`, `text-primary`, `border-border`, `font-display`, `container-luxe`, existing Button/Input/Card variants). No new colors, no new fonts. Sidebar uses shadcn `sidebar` component (install if missing) themed with existing tokens.

## Customer-site touchpoints (small, additive edits)

- `header.tsx` — announcement text from `useSiteContent()`
- `index.tsx` — hero title/subtitle/image/CTA + section titles from `useSiteContent()`; product rows filtered by admin-selected IDs when set
- `footer.tsx`, `about.tsx`, `contact.tsx` — read same hook, fall back to current hard-coded strings

No visual changes when content matches current defaults (seed values = current strings).

## Out of scope

Real backend, real auth, real payments, product colors, editing customer visual design.

## Deliverable check before finishing

- All 16 routes exist and render
- Login gate works; refresh keeps session
- Editing hero title in `/admin/content` updates `/` immediately
- Typecheck passes
