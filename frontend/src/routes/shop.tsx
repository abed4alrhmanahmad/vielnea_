import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Shell } from "@/components/layout/shell";
import { ProductCard } from "@/components/shop/product-card";
import { ShopHero } from "@/components/shop/shop-hero";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useProducts } from "@/services/products";
import { categoriesOptions, useCategories } from "@/services/categories";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  cat: z.string().optional(),
  q: z.string().optional(),
  sort: z.enum(["newest", "price-asc", "price-desc", "rating"]).optional(),
  page: z.number().int().min(1).optional(),
  gift: z.string().optional(),
});

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Vielinea" },
      {
        name: "description",
        content: "Shop the Vielinea collection of dresses, blouses, pants, handbags and jewelry.",
      },
      { property: "og:title", content: "Shop — Vielinea" },
      { property: "og:description", content: "Browse the full Vielinea collection." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(categoriesOptions()),
  validateSearch: (s) => searchSchema.parse(s),
  component: ShopPage,
});

const PAGE_SIZE = 8;

/** Scroll target for the hero's "Explore Collection" button. */
const PRODUCTS_ANCHOR = "shop-collection";

function ShopPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState(search.q ?? "");

  // Filtering, sorting and pagination all happen in Postgres via the API.
  const { data, isPending, isError, error, refetch, isFetching } = useProducts({
    search: search.q,
    category: search.cat,
    sort: search.sort ?? "newest",
    page: search.page ?? 1,
    limit: PAGE_SIZE,
    gift: search.gift ? true : undefined,
  });

  const categoriesQuery = useCategories();

  const products = data?.products ?? [];
  const page = data?.pagination.page ?? search.page ?? 1;
  const totalPages = data?.pagination.totalPages ?? 1;

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, page: 1, ...patch }) as never,
    });

  // Categories come from the database; the loader prefetches them so the
  // control is populated on first paint.
  const categoryOptions = (categoriesQuery.data ?? []).map((c) => ({
    value: c.slug,
    label: c.label,
  }));

  return (
    <Shell>
      <ShopHero targetId={PRODUCTS_ANCHOR} />

      <div className="container-luxe pt-12 pb-6">
        <nav className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-4">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-primary">Shop</span>
        </nav>
        <h2 className="font-display text-4xl md:text-5xl text-center">Shop</h2>
        <p className="text-center text-muted-foreground mt-3">Discover our latest collection</p>
      </div>

      <div
        id={PRODUCTS_ANCHOR}
        className="container-luxe scroll-mt-24 flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between border-y border-border py-4"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Category</span>
          <Select
            value={search.cat ?? "all"}
            onValueChange={(v) => setSearch({ cat: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch({ q: q || undefined });
          }}
          className="relative flex-1 max-w-md"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products..."
            className="pl-9"
          />
        </form>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sort</span>
          <Select value={search.sort ?? "newest"} onValueChange={(v) => setSearch({ sort: v })}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
              <SelectItem value="rating">Top Rated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="container-luxe py-12">
        {isPending ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="aspect-[3/4] w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-24">
            <p className="font-display text-2xl text-foreground">We couldn't load the collection</p>
            <p className="text-muted-foreground mt-3 text-sm">
              {error instanceof Error ? error.message : "Please try again in a moment."}
            </p>
            <Button onClick={() => void refetch()} className="mt-6">
              Try again
            </Button>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-muted-foreground">No products match your search.</p>
            {(search.q || search.cat || search.gift) && (
              <Button
                variant="outline"
                className="mt-6 border-primary text-primary"
                onClick={() => {
                  setQ("");
                  void navigate({ search: {} as never });
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div
            className={`grid grid-cols-2 md:grid-cols-4 gap-6 transition-opacity ${isFetching ? "opacity-60" : ""}`}
          >
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}

        {totalPages > 1 && !isError && (
          <div className="mt-12 flex justify-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => {
              const n = i + 1;
              const active = n === page;
              return (
                <button
                  key={n}
                  onClick={() =>
                    navigate({
                      search: (prev: Record<string, unknown>) => ({ ...prev, page: n }) as never,
                    })
                  }
                  className={`size-10 text-sm ${active ? "bg-primary text-primary-foreground" : "border border-border text-foreground hover:border-primary hover:text-primary"}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </Shell>
  );
}
