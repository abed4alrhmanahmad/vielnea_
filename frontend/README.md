# Vielinea — Luxury Fashion Storefront + Admin Dashboard

A frontend-only e-commerce experience built with React 19, TypeScript, Vite,
Tailwind CSS v4, shadcn/ui, Framer Motion, TanStack Router and TanStack Query.
All data is mock data persisted in `localStorage` — no backend required.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL printed in the terminal.

## Production build

```bash
npm install
npm run build
npm run preview
```

## Scripts

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `npm run dev`     | Start the dev server              |
| `npm run build`   | Production build                  |
| `npm run preview` | Preview the production build      |
| `npm run lint`    | ESLint (0 errors, 0 warnings)     |
| `npm run format`  | Format the codebase with Prettier |

## Admin dashboard

Visit `/admin/login` and sign in with the admin account created by the backend
seed, using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in `backend/.env`.
Those credentials are not published here and have no default value.

All admin routes are protected and redirect to the login page when signed out.

## Project structure

```text
public/            static files (favicon)
src/assets/        local images (logo, hero, product photography)
src/components/    layout, shop and shadcn/ui components
src/contexts/      storefront state (cart, wishlist, auth)
src/data/          mock product catalog
src/services/      storefront services (reviews)
src/admin/         admin services, storage helpers and shell
src/routes/        file-based routes (storefront + admin)
src/styles.css     design tokens and Tailwind theme
```

Fonts (Playfair Display, Inter) are self-hosted via `@fontsource` packages and
icons come from `lucide-react`, so the project is fully self-contained and works
offline after `npm install`.
