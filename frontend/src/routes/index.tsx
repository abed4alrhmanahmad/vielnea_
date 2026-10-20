import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Truck,
  RotateCcw,
  ShieldCheck,
  HeadphonesIcon,
  type LucideIcon,
} from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { ProductCard } from "@/components/shop/product-card";
import { HeroCarousel } from "@/components/home/hero-carousel";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  findSection,
  sitePageOptions,
  testimonialsOptions,
  useSitePage,
  useSiteSettings,
  useTestimonials,
} from "@/services/site-content";
import { heroSlidesOptions } from "@/services/hero-slides";
import { categoriesOptions, useCategories } from "@/services/categories";
import { productListOptions, useProducts } from "@/services/products";
import { useNewsletterMutation } from "@/services/contact";
import type { StoreProduct } from "@/lib/api/mappers";
import { Skeleton } from "@/components/ui/skeleton";
import { IMAGE_SIZES, ResponsiveImage } from "@/components/responsive-image";
import { selectedImagesOptions, useSelectedImages } from "@/services/selected-images";

/** Icon names live in CMS settings; the components themselves stay in code. */
const VALUE_ICONS: Record<string, LucideIcon> = {
  Truck,
  RotateCcw,
  ShieldCheck,
  HeadphonesIcon,
};

/**
 * Rendered width of one Instagram tile: six across the container from `md` up,
 * two across below it, each losing the 8px `pr-2` gutter.
 */
const INSTAGRAM_SIZES =
  "(min-width: 1400px) 219px, (min-width: 768px) calc((100vw - 40px) / 6 - 8px), calc((100vw - 40px) / 2 - 8px)";

/** Tiles visible across the viewport, by breakpoint — the strip's identity. */
const INSTAGRAM_TILES_ACROSS_SM = 2;
const INSTAGRAM_TILES_ACROSS_MD = 6;
/** Seconds the marquee spends travelling one tile's width. */
const INSTAGRAM_SECONDS_PER_TILE = 5;

/**
 * The marquee's geometry for a given number of tiles.
 *
 * The strip scrolls by translating the animated row exactly one group width,
 * at which point the next identical group sits where the previous one was and
 * the loop is invisible. That only holds if the shift matches the group width,
 * and the group width is a function of how many tiles there are — which is now
 * whatever the admin selected rather than a fixed six.
 *
 * Percentages are of the animated row's own width, which is the viewport-wide
 * container, so a group holding `count` tiles at `across` tiles per screen is
 * `count / across` screens wide.
 *
 * `copies` is how many times the group is repeated. Two is enough only while a
 * group is at least a screen wide; with fewer than six images it is not, and
 * two copies would run out mid-cycle and scroll blank space through the strip.
 * The row has to span the viewport even at its most-translated moment — one
 * group width in — so it needs `100% / group + 1` copies, rounded up. At six
 * images that is 2, exactly what shipped.
 *
 * Duration scales with the count so the strip keeps a constant pixel speed:
 * a fixed 30s would make twelve images scroll twice as fast as six.
 *
 * At count = 6 every value here reproduces the hardcoded ones the strip shipped
 * with: group 300%/100%, tile 1/6, shift -300%/-100%, 30s, 2 copies.
 */
function instaMarquee(count: number): { style: React.CSSProperties; copies: number[] } {
  const groupSm = (count / INSTAGRAM_TILES_ACROSS_SM) * 100;
  const groupMd = (count / INSTAGRAM_TILES_ACROSS_MD) * 100;
  // Desktop is the binding case: its groups are the narrower of the two, so a
  // count that covers the viewport there covers it on mobile too.
  const copies = Math.max(2, Math.ceil(INSTAGRAM_TILES_ACROSS_MD / count) + 1);
  return {
    style: {
      "--insta-tile": `${100 / count}%`,
      "--insta-group-sm": `${groupSm}%`,
      "--insta-group-md": `${groupMd}%`,
      "--insta-shift-sm": `-${groupSm}%`,
      "--insta-shift-md": `-${groupMd}%`,
      "--insta-duration": `${count * INSTAGRAM_SECONDS_PER_TILE}s`,
    } as React.CSSProperties,
    copies: Array.from({ length: copies }, (_, i) => i),
  };
}

/**
 * How many products back the homepage rows.
 *
 * One request feeds every row, and `itemsForSection` picks each row's items
 * out of it by flag (new / best seller / gift / featured). The three rows the
 * CMS ships render 4 each, so 12 are shown — the rest of this budget is the
 * headroom that filtering needs, since a row's 4 matches can sit anywhere in
 * the sort order. Shared by the loader and the hook: the value is part of the
 * React Query key, so if the two disagreed the client would miss the
 * server's cache entry, refetch, and render different markup than the server
 * sent.
 */
const HOME_PRODUCT_LIMIT = 24;

/**
 * Splits a CMS href like "/shop?cat=vests" into the route and its search
 * params, so a category card can point at a standalone page (Accessories) or a
 * shop filter through the same typed <Link>. Mirrors the header's parseNavHref.
 */
function parseCategoryHref(href: string): { to: string; search?: Record<string, string> } {
  const [path, query] = href.split("?");
  const to = path || "/";
  if (!query) return { to };
  const search: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) search[key] = value;
  return { to, search };
}

export const Route = createFileRoute("/")({
  // Server-rendered so hero copy and section titles reach crawlers.
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(sitePageOptions("home")),
      context.queryClient.ensureQueryData(heroSlidesOptions()),
      context.queryClient.ensureQueryData(testimonialsOptions()),
      // Server-rendered so the strip is in the initial HTML: it would otherwise
      // appear only after hydration and shift everything below it.
      context.queryClient.ensureQueryData(selectedImagesOptions()),
      // Product rows are server-rendered too, so section titles and product
      // names are in the initial HTML.
      context.queryClient.ensureQueryData(productListOptions({ limit: HOME_PRODUCT_LIMIT })),
      context.queryClient.ensureQueryData(categoriesOptions()),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Vielinea — Timeless Luxury for the Modern Woman" },
      {
        name: "description",
        content:
          "Discover Vielinea's collection of elegant dresses, blouses, handbags and jewelry — timeless luxury made for everyday.",
      },
      { property: "og:title", content: "Vielinea — Timeless Luxury" },
      { property: "og:description", content: "Timeless luxury for the modern woman." },
    ],
  }),
  component: Home,
});

function Home() {
  const site = useSiteSettings();
  const { data: page } = useSitePage("home");
  const { data: testimonials = [] } = useTestimonials();
  const { data: apiCategories = [] } = useCategories();
  const newsletter = useNewsletterMutation();

  // One request backs every product row on the page.
  const catalogueQuery = useProducts({ limit: HOME_PRODUCT_LIMIT });
  const products = catalogueQuery.data?.products ?? [];

  // --- CMS-driven sections --------------------------------------------------
  const valueBar = findSection(page, "value_bar");
  const valueItems =
    (valueBar?.settings["items"] as Array<{ icon: string; title: string; sub: string }>) ?? [];

  const categoriesSection = findSection(page, "featured_categories");
  const categoryKeys = (categoriesSection?.settings["categories"] as string[] | undefined) ?? [];
  const categoryLabelOverrides =
    (categoriesSection?.settings["labels"] as Record<string, string> | undefined) ?? {};
  // A category whose card should open somewhere other than the shop filter —
  // Accessories has its own page, so the CMS points that key at "/accessories"
  // rather than a /shop?cat= link nobody stocks.
  const categoryHrefOverrides =
    (categoriesSection?.settings["hrefs"] as Record<string, string> | undefined) ?? {};
  // Category cards use live categories from the database, with the CMS choosing
  // which ones appear, in what order, and any label or destination override.
  const featuredCategories = categoryKeys.flatMap((key) => {
    const match = apiCategories.find((c) => c.slug === key);
    if (!match) return [];
    const href = categoryHrefOverrides[key];
    return [
      {
        key,
        label: categoryLabelOverrides[key] ?? match.label,
        image: match.imageUrl ?? "",
        // Same shape the header derives from CMS hrefs, so one <Link> covers both.
        ...(href ? parseCategoryHref(href) : { to: "/shop", search: { cat: key } }),
      },
    ];
  });

  const testimonialsSection = findSection(page, "testimonials");
  const instagramSection = findSection(page, "instagram");
  // The marquee's images, exactly as the admin ordered them. The endpoint
  // already filters to active rows and sorts by display order, so this array
  // is rendered as-is — no client-side filtering, and no hardcoded fallback.
  const instagramImages = useSelectedImages().data ?? [];
  const marquee = instaMarquee(Math.max(1, instagramImages.length));
  const newsletterSection = findSection(page, "newsletter");

  const pickByIds = (ids: string[]) =>
    ids.map((id) => products.find((p) => p.id === id)).filter((p): p is StoreProduct => Boolean(p));

  /** Resolves the products for a CMS product_row section. */
  const itemsForSection = (section: ReturnType<typeof findSection>): StoreProduct[] => {
    if (!section) return [];
    const settings = section.settings;
    const limit = Number(settings["limit"] ?? 4);
    const explicit = (settings["productIds"] as string[] | undefined) ?? [];
    if (explicit.length > 0) return pickByIds(explicit).slice(0, limit);

    switch (String(settings["source"] ?? "")) {
      case "newArrival":
        return products.filter((p) => p.isNew).slice(0, limit);
      case "bestSeller":
        return products.filter((p) => p.isBestSeller).slice(0, limit);
      case "gift":
        return products.filter((p) => p.hasGift).slice(0, limit);
      case "featured":
        return products.filter((p) => p.isFeatured).slice(0, limit);
      case "category":
        return products
          .filter((p) => p.category === String(settings["category"] ?? ""))
          .slice(0, limit);
      default:
        return [];
    }
  };

  // Product rows in the order and visibility the CMS defines.
  const productRows = (page?.sections ?? [])
    .filter((s) => s.sectionType === "product_row" && s.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((s) => ({
      key: s.sectionKey,
      title: s.title ?? "",
      items: itemsForSection(s),
      linkSearch: s.settings["linkSearch"] as Record<string, string> | undefined,
    }))
    .filter((row) => row.items.length > 0);
  return (
    <Shell>
      {/* Hero — a carousel driven entirely by GET /hero-slides. */}
      <HeroCarousel />

      {/* Value bar */}
      <section className="border-y border-border bg-background">
        <div className="container-luxe grid grid-cols-2 md:grid-cols-4 gap-6 py-8">
          {valueItems.map(({ icon, title, sub }) => {
            const Icon = VALUE_ICONS[icon] ?? Truck;
            return (
              <div key={title} className="flex items-center gap-3">
                <Icon className="size-6 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Featured categories */}
      <section className="container-luxe py-20">
        <div className="grid md:grid-cols-3 gap-4">
          {featuredCategories.map((c) => (
            <Link
              key={c.key}
              to={c.to}
              search={c.search as never}
              className="group relative aspect-[4/5] overflow-hidden rounded-lg bg-secondary"
            >
              <ResponsiveImage
                src={c.image}
                alt={c.label}
                sizes={IMAGE_SIZES.categoryCard}
                loading="lazy"
                className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-6 left-6 text-background">
                <p className="font-display text-2xl">{c.label}</p>
                <p className="text-xs uppercase tracking-[0.2em] mt-1 flex items-center gap-1">
                  Discover <ArrowRight className="size-3" />
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {catalogueQuery.isPending && (
        <section className="container-luxe py-16">
          <Skeleton className="h-9 w-64 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="aspect-[3/4] w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            ))}
          </div>
        </section>
      )}

      {catalogueQuery.isError && (
        <section className="container-luxe py-16 text-center">
          <p className="text-muted-foreground text-sm">
            The collection couldn't be loaded right now. Please refresh to try again.
          </p>
        </section>
      )}

      {productRows.map((row) => (
        <ProductRow
          key={row.key}
          title={row.title}
          items={row.items}
          link="/shop"
          linkSearch={row.linkSearch}
        />
      ))}

      {/* Testimonials */}
      <section className="bg-secondary/50 border-y border-border">
        <div className="container-luxe py-20">
          <p className="text-[11px] uppercase tracking-[0.35em] text-primary text-center mb-4">
            {testimonialsSection?.subtitle}
          </p>
          <h2 className="font-display text-4xl md:text-5xl text-center text-foreground">
            {testimonialsSection?.title}
          </h2>
          <div className="mt-14 grid md:grid-cols-3 gap-10">
            {testimonials.map((t) => (
              <figure key={t.id} className="text-center">
                <blockquote className="font-display text-xl italic text-foreground leading-relaxed">
                  "{t.quote}"
                </blockquote>
                <figcaption className="mt-6 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  {t.name} · {t.location}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Instagram. The whole section is omitted when the admin has no active
          selected images: an empty marquee would be a bare strip of placeholder
          boxes under a heading, and inventing filler imagery is worse. It comes
          back by itself as soon as one image is switched on. */}
      {instagramImages.length > 0 && (
        <section className="container-luxe py-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-primary mb-2">
                {instagramSection?.subtitle}
              </p>
              <h2 className="font-display text-3xl md:text-4xl">{instagramSection?.title}</h2>
            </div>
            <a
              href={instagramSection?.buttonUrl || "#"}
              className="text-xs uppercase tracking-[0.25em] text-primary hover:text-primary-dark"
            >
              {instagramSection?.buttonText}
            </a>
          </div>
          {/* Marquee viewport. The -mr-2 bleed swallows the trailing gap of the
            last tile, so tiles land on exactly the same grid the static layout
            used (2 across on mobile, 6 from md up). */}
          <div className="overflow-hidden -mr-2">
            <div
              // The geometry below used to be hardcoded for exactly six tiles
              // (`w-[300%] md:w-full`, `w-1/6`, `-300%/-100%`, `30s`). The images
              // are admin-managed now, so the count is whatever the owner chose
              // and those literals are computed instead — see `instaMarquee`.
              // At six images every value below is identical to what shipped.
              style={marquee.style}
              className="flex [--insta-shift:var(--insta-shift-sm)] md:[--insta-shift:var(--insta-shift-md)] [will-change:transform] animate-[insta-marquee_var(--insta-duration)_linear_infinite] motion-reduce:animate-none"
            >
              {/* Identical groups: the ones after the first are what show as the
                cycle advances, so the wrap back to the start is invisible. Only
                the first is exposed to assistive tech and the tab order — the
                others repeat the same links. */}
              {marquee.copies.map((copy) => (
                <div
                  key={copy}
                  className="flex shrink-0 w-[var(--insta-group-sm)] md:w-[var(--insta-group-md)]"
                  aria-hidden={copy > 0 || undefined}
                >
                  {instagramImages.map((tile) => {
                    {
                      /* Each tile carries its own destination. Several tiles
                        pointing at the same post is the normal case — the owner
                        picked more than one picture out of one carousel — so
                        nothing here groups or de-duplicates by URL. */
                    }
                    // Identical for both branches, so the tile looks and sizes
                    // the same whether or not it has a link.
                    const tileClass = "block aspect-square overflow-hidden rounded-sm bg-secondary";
                    const picture = (
                      /* Eager: a tile that lazy-loads as it slides in would
                         leave a blank card mid-marquee. `fetchPriority="low"`
                         is what keeps that affordable — the strip sits far
                         below the fold, so it must never compete with the
                         hero for bandwidth. */
                      <ResponsiveImage
                        src={tile.imageUrl}
                        sizes={INSTAGRAM_SIZES}
                        alt=""
                        decoding="async"
                        fetchPriority="low"
                        className="size-full object-cover hover:scale-105 transition-transform duration-500"
                      />
                    );
                    return (
                      <div key={tile.id} className="w-[var(--insta-tile)] shrink-0 pr-2">
                        {tile.instagramUrl ? (
                          <a
                            href={tile.instagramUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            tabIndex={copy > 0 ? -1 : undefined}
                            aria-label="View this post on Instagram"
                            className={tileClass}
                          >
                            {picture}
                          </a>
                        ) : (
                          // No link set, so the tile goes to the storefront's
                          // own home route. A router Link rather than an <a>,
                          // so it navigates client-side like every other
                          // internal link instead of reloading the page.
                          <Link
                            to="/"
                            tabIndex={copy > 0 ? -1 : undefined}
                            aria-label="Vielinea homepage"
                            className={tileClass}
                          >
                            {picture}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-luxe py-16 text-center max-w-2xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl">
            {newsletterSection?.title ?? site.newsletter.title}
          </h2>
          <p className="mt-3 text-primary-foreground/80 text-sm">
            {newsletterSection?.content ?? site.newsletter.body}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const email = new FormData(form).get("email");
              if (typeof email !== "string" || !email) return;
              // Persisted to newsletter_subscribers; duplicates are handled server-side.
              newsletter.mutate({ email, source: "homepage" }, { onSuccess: () => form.reset() });
            }}
            className="mt-8 flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
          >
            <Input
              name="email"
              type="email"
              required
              placeholder="Your email"
              className="bg-background text-foreground"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={newsletter.isPending}
              className="bg-background text-primary hover:bg-background/90"
            >
              {newsletter.isPending ? "Joining…" : "Subscribe"}
            </Button>
          </form>
        </div>
      </section>
    </Shell>
  );
}

function ProductRow({
  title,
  items,
  link,
  linkSearch,
}: {
  title: string;
  items: StoreProduct[];
  link: "/shop";
  linkSearch?: Record<string, string>;
}) {
  return (
    <section className="container-luxe py-16">
      <div className="flex items-end justify-between gap-4 mb-8">
        <h2 className="font-display text-3xl md:text-4xl text-foreground">{title}</h2>
        <Link
          to={link}
          search={linkSearch as never}
          className="shrink-0 whitespace-nowrap pb-1 text-xs uppercase tracking-[0.25em] text-primary hover:text-primary-dark flex items-center gap-1"
        >
          View All <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
