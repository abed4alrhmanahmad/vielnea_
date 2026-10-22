import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import accessoriesHeroImg from "@/assets/vielinea-accessories-hero.webp";
import accessoriesHeroImg688 from "@/assets/vielinea-accessories-hero-688.webp";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accessoryListOptions, useAccessories } from "@/services/accessories";
import type { ApiAccessory } from "@/lib/api/types";
import { AccessoryCard, AccessoryDialog } from "@/components/shop/accessory-card";

const searchSchema = z.object({
  q: z.string().optional(),
  sort: z.enum(["featured", "newest", "price-asc", "price-desc", "name"]).optional(),
  page: z.number().int().min(1).optional(),
});

const PAGE_SIZE = 12;

/** The storefront's sort labels, mapped onto the accessories API sort keys. */
const SORT_KEYS: Record<string, string> = {
  featured: "manual",
  newest: "newest",
  "price-asc": "price_asc",
  "price-desc": "price_desc",
  name: "name_asc",
};

export const Route = createFileRoute("/accessories")({
  head: () => ({
    meta: [
      { title: "Accessories — Vielinea" },
      {
        name: "description",
        content:
          "Complementary finishing pieces from Vielinea — gift accessories chosen to accompany your order.",
      },
      { property: "og:title", content: "Accessories — Vielinea" },
      {
        property: "og:description",
        content: "Complementary finishing pieces, chosen to accompany your order.",
      },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      accessoryListOptions({
        search: deps.search.q,
        sort: SORT_KEYS[deps.search.sort ?? "featured"],
        page: deps.search.page ?? 1,
        limit: PAGE_SIZE,
      }),
    ),
  component: AccessoriesPage,
});

/**
 * The public Accessories page.
 *
 * Accessories are their own entity — complementary / gift items managed in
 * their own admin section — so this page reads `/api/accessories` directly and
 * never touches the product list or its category filter.
 */
function AccessoriesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState(search.q ?? "");
  const [selected, setSelected] = useState<ApiAccessory | null>(null);

  const { data, isPending, isError, error, refetch, isFetching } = useAccessories({
    search: search.q,
    sort: SORT_KEYS[search.sort ?? "featured"],
    page: search.page ?? 1,
    limit: PAGE_SIZE,
  });

  const accessories = data?.accessories ?? [];
  const page = data?.pagination.page ?? search.page ?? 1;
  const totalPages = data?.pagination.totalPages ?? 1;

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, page: 1, ...patch }) as never,
    });

  return (
    <Shell>
      <div className="container-luxe pt-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="relative isolate mx-auto w-full max-w-[1120px] overflow-hidden rounded-lg aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9]"
        >
          <img
            src={accessoriesHeroImg}
            // The frame is capped at 1120px and is full-bleed below that, so a
            // phone picks the 688w file instead of downloading the desktop one.
            srcSet={`${accessoriesHeroImg688} 688w, ${accessoriesHeroImg} 1376w`}
            sizes="(min-width: 1120px) 1120px, 100vw"
            alt="Enamel flower brooch accessories laid out on a sunlit surface"
            width={1376}
            height={768}
            fetchPriority="high"
            decoding="async"
            // The brooches sit in the right half of the photo; on the 4:3 phone
            // frame a centred crop cuts the last one off, so phones crop right.
            className="absolute inset-0 size-full object-cover object-right sm:object-center"
          />
        </motion.div>
      </div>

      <div className="container-luxe pt-8 pb-6">
        <nav className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-4">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-primary">Accessories</span>
        </nav>
        <h1 className="font-display text-4xl md:text-5xl text-center">Accessories</h1>
        <p className="text-center text-muted-foreground mt-3 max-w-xl mx-auto">
          Complementary finishing pieces, chosen to accompany your order.
        </p>
      </div>

      <div className="container-luxe flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between border-y border-border py-4">
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
            placeholder="Search accessories..."
            className="pl-9"
          />
        </form>

        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sort</span>
          <Select value={search.sort ?? "featured"} onValueChange={(v) => setSearch({ sort: v })}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Featured</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
              <SelectItem value="name">Name</SelectItem>
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
            <p className="font-display text-2xl text-foreground">
              We couldn't load the accessories
            </p>
            <p className="text-muted-foreground mt-3 text-sm">
              {error instanceof Error ? error.message : "Please try again in a moment."}
            </p>
            <Button onClick={() => void refetch()} className="mt-6">
              Try again
            </Button>
          </div>
        ) : accessories.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-muted-foreground">
              {search.q ? "No accessories match your search." : "No accessories just yet."}
            </p>
            {search.q && (
              <Button
                variant="outline"
                className="mt-6 border-primary text-primary"
                onClick={() => {
                  setQ("");
                  void navigate({ search: {} as never });
                }}
              >
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <div
            className={`grid grid-cols-2 md:grid-cols-4 gap-6 transition-opacity ${isFetching ? "opacity-60" : ""}`}
          >
            {accessories.map((a) => (
              <AccessoryCard key={a.id} accessory={a} onOpen={() => setSelected(a)} />
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

      <AccessoryDialog accessory={selected} onClose={() => setSelected(null)} />
    </Shell>
  );
}
