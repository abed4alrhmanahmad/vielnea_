# Deploying VIELINEA as one Node.js app

This repository can run as a **single Node.js process**: the Express API
(`backend/`) also serves the storefront (`frontend/`, TanStack Start with
server-side rendering) on the same port. This is the shape GoDaddy Node.js
Hosting expects. Local development is unchanged; see the main README.

> [!WARNING]
> **Database blocker on GoDaddy Node.js Hosting.** GoDaddy's published deploy
> contract allows outbound traffic only on HTTP (80) and HTTPS (443), plus its
> own managed MySQL. Remote PostgreSQL on 5432 or 6543 is blocked. The backend
> reaches Supabase Postgres on 5432, so on GoDaddy every database call would
> fail. See [Hosting options](#hosting-options) before deploying there.

## Requirements

- **Node.js 22.12 or newer** (22 LTS or 24). The storefront's build tools require it.
- **npm**, using the committed lockfiles (`package-lock.json` at the root and in each app).
- Outbound access to Supabase: HTTPS (443) for Storage and PostgreSQL (5432) for the database.

| | Command |
| --- | --- |
| Install | `npm ci --omit=dev` |
| Build | `npm run build` |
| Start | `npm start` |
| Health | `GET /api/health` (process up), `GET /api/health/db` (database reachable) |

## How it works

| Step | Command | What it does |
| --- | --- | --- |
| Install | `npm ci --omit=dev` (run by the platform) | The root package has no dependencies; nothing heavy happens here. |
| Build | `npm run build` → `scripts/build.mjs` | Runs `npm ci` and `npm run build` in `backend/` (TypeScript → `backend/dist`) and `frontend/` (Vite + Nitro `node-middleware` → `frontend/.output`). |
| Start | `npm start` → `server.mjs` | Starts `backend/dist/src/server.js` with `FRONTEND_OUTPUT_DIR=frontend/.output`, so Express serves the storefront too. |

Request routing in the running process:

- `/api/*`: the existing Express API, unchanged. Unknown API paths return the usual JSON 404.
- Static files (`/assets/*`, `/images/*`, `favicon.ico`, …): served from `frontend/.output/public`. Hashed bundles under `/assets` are cached for a year.
- Every other path: rendered by the storefront (SSR), including direct visits and refreshes on deep links. Unknown pages get the storefront's 404 page.

The storefront is built with `VITE_API_URL=/api`. Browsers call the API on
the same origin; SSR calls it over loopback (`http://127.0.0.1:$PORT/api`).
Those loopback calls are exempt from the general rate limiter, because they
carry no client IP; requests arriving through a proxy (`X-Forwarded-For`) are
always limited.

## Environment variables

Set these in the hosting dashboard. Never commit their values.

| Name | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes (or `DATABASE_URL`) | Supabase pooler connection. On GoDaddy these names are also used by the platform's managed MySQL; do not enable it for this app. |
| `JWT_SECRET` | yes | At least 32 characters. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | yes | Validated at boot. |
| `SUPABASE_SERVICE_ROLE_KEY` | for admin image uploads | Server-only. Never expose it to the browser. |
| `SUPABASE_ANON_KEY` | optional | |
| `FRONTEND_URL` | recommended | The public site URL, e.g. `https://your-domain.com`. Same-origin requests need no CORS entry; list other origins comma-separated. |
| `EMAIL_API_KEY`, `EMAIL_FROM`, `ORDER_NOTIFICATION_EMAIL` | optional | Resend over HTTPS. Without a key, order emails are skipped. |
| `PAYMENT_PROVIDER` | optional | Defaults to `unconfigured`. `sandbox` is rejected in production. |
| `JWT_EXPIRES_IN`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` | optional | |
| `PORT` | set by the platform | Falls back to 5000. |
| `HOST` | optional | Interface to bind. Defaults to `0.0.0.0` in production. |
| `NODE_ENV` | optional | `server.mjs` defaults it to `production`. |
| `VITE_API_URL` | build time, optional | Defaults to `/api`. Set an absolute URL only for split hosting (below). |

`FRONTEND_OUTPUT_DIR` and `INTERNAL_API_ORIGIN` are set automatically and
normally need no value.

Missing or invalid required variables stop the server at boot with the
variable's name and the problem. Secret values are never printed.

## Database connections

The runtime connects with the `pg` driver to Supabase's pooler in **session
mode** (port 5432), with SSL. Session mode is required by the live-chat
`LISTEN` connection. Each running instance holds up to 10 pooled connections
plus 1 for chat, and the session pooler has only a few slots. Several
instances, or a local development backend pointed at the production database,
can exhaust them. Requests then wait 15 s and fail with HTTP 500
(`Connection terminated due to connection timeout` in the log). Run one
instance, and keep local development off the production database.

`DATABASE_POOL_URL` is declared in `backend/src/config/env.ts` but is not used
by the pool yet.

## Hosting options

1. **Any Node host that allows outbound Postgres** (Render, Railway, Fly.io, a VPS):
   deploy this repository as-is with build `npm run build` and start `npm start`.
2. **Split hosting with GoDaddy:** host this same repository on a Postgres-capable host
   for the API, and on GoDaddy for the storefront, building the GoDaddy copy with
   `VITE_API_URL=https://<api-host>/api` and adding the GoDaddy site URL to the
   API's `FRONTEND_URL`. The storefront then reaches the API over HTTPS, which
   GoDaddy allows. The storefront still loads the backend at startup, so the
   GoDaddy copy needs the required variables above even though its own `/api`
   goes unused.
3. **Everything on GoDaddy** requires replacing the direct Postgres connection
   with HTTPS (Supabase's REST API) or GoDaddy MySQL. That is a data-layer
   rewrite, not a configuration change.

## Verify a build locally

```bash
npm run build          # stop any `wrangler dev` on frontend/.output first
PORT=3100 npm start    # reads backend/.env locally; the platform uses its own env
curl http://localhost:3100/api/health/db
```
