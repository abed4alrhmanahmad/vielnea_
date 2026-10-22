import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, Minus, Plus, Star, RotateCcw, ShieldCheck } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { ProductCard } from "@/components/shop/product-card";
import { ProductReviews } from "@/components/shop/product-reviews";
import { IMAGE_SIZES, ResponsiveImage } from "@/components/responsive-image";
import { isSizeAvailable, isSoldOut } from "@/lib/availability";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useStore } from "@/contexts/store-context";
import { productDetailOptions, useRelatedProducts } from "@/services/products";
import type { StoreProduct } from "@/lib/api/mappers";
import { ApiError } from "@/lib/api/client";

/**
 * Per-click cap for the quantity stepper. Fixed rather than the stock level, so
 * the stepper never reveals how many are left; the server rejects quantities
 * above real stock with a message that does not state the count.
 */
const MAX_QTY = 10;

export const Route = createFileRoute("/product/$id")({
  // Loaded server-side so the product's title/description reach the SEO tags.
  loader: async ({ params, context }): Promise<{ product: StoreProduct }> => {
    try {
      const product = await context.queryClient.ensureQueryData(productDetailOptions(params.id));
      return { product };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.product.title} — Vielinea` },
          { name: "description", content: loaderData.product.description },
          { property: "og:title", content: `${loaderData.product.title} — Vielinea` },
          { property: "og:description", content: loaderData.product.description },
          { property: "og:type", content: "product" },
        ]
      : [{ title: "Product — Vielinea" }, { name: "robots", content: "noindex" }],
  }),
  errorComponent: () => (
    <Shell>
      <div className="container-luxe py-24 text-center">Something went wrong.</div>
    </Shell>
  ),
  notFoundComponent: () => (
    <Shell>
      <div className="container-luxe py-24 text-center">
        <h1 className="font-display text-3xl">Product not found</h1>
        <Link to="/shop" className="mt-6 inline-block text-primary underline underline-offset-4">
          Back to shop
        </Link>
      </div>
    </Shell>
  ),
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData() as { product: StoreProduct };
  const { addToCart, toggleWishlist, isWishlisted } = useStore();
  const [activeImg, setActiveImg] = useState(0);
  // Start on the first size that can be bought; a fully sold-out product keeps its first.
  const [size, setSize] = useState<string>(
    product.sizes.find((s) => isSizeAvailable(product, s)) ?? product.sizes[0] ?? "One Size",
  );
  const [qty, setQty] = useState(1);
  const relatedQuery = useRelatedProducts(product.slug);
  const related = relatedQuery.data ?? [];
  const finalPrice = product.finalPrice;
  const wished = isWishlisted(product.id);

  // Availability only — exact stock is never shown to customers. The server
  // re-checks real quantities on add-to-cart, quantity change and checkout.
  const soldOut = isSoldOut(product);
  const outOfStock = soldOut || !isSizeAvailable(product, size);
  // The API returns the label with the product; no local category table needed.
  const categoryLabel = product.categoryLabel || product.category;

  return (
    <Shell>
      <div className="container-luxe pt-8">
        <nav className="text-xs text-muted-foreground uppercase tracking-[0.2em]">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link to="/shop" search={{ cat: product.category }} className="hover:text-primary">
            {categoryLabel}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-primary">{product.title}</span>
        </nav>
      </div>

      <section className="container-luxe grid md:grid-cols-2 gap-12 py-12">
        {/* Thumbnails: a column left of the image from md up; a row under it on
            phones (only when there is more than one image to switch to). */}
        <div className="flex flex-col-reverse gap-4 md:flex-row">
          <div
            className={`${product.images.length > 1 ? "flex" : "hidden md:flex"} gap-3 overflow-x-auto p-0.5 md:flex-col md:w-20 md:shrink-0 md:overflow-visible md:p-0`}
          >
            {product.images.map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImg(i)}
                aria-label={`Show image ${i + 1}`}
                className={`aspect-square w-16 shrink-0 overflow-hidden rounded md:w-auto ${activeImg === i ? "ring-2 ring-primary" : "opacity-70"}`}
              >
                <ResponsiveImage
                  src={img}
                  alt=""
                  sizes={IMAGE_SIZES.productThumb}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
          <motion.div
            key={activeImg}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="relative flex-1 w-full aspect-[4/5] overflow-hidden rounded-lg bg-secondary"
          >
            <ResponsiveImage
              src={product.images[activeImg]}
              alt={product.title}
              sizes={IMAGE_SIZES.productDetail}
              // The gallery's lead image is this page's LCP, so it is fetched
              // with the page rather than lazily.
              fetchPriority="high"
              className="size-full object-cover"
            />
            {soldOut && (
              <span className="absolute top-4 left-4 bg-foreground text-background text-xs font-medium uppercase tracking-widest px-3 py-1.5">
                Sold out
              </span>
            )}
          </motion.div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary">{categoryLabel}</p>
          <h1 className="font-display text-4xl md:text-5xl mt-3">{product.title}</h1>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`size-4 ${i < Math.round(product.rating) ? "fill-primary text-primary" : ""}`}
              />
            ))}
            <span>
              {product.rating.toFixed(1)} · {product.reviewCount} reviews
            </span>
          </div>
          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-display text-3xl text-primary">${finalPrice.toFixed(0)}</span>
            {product.discount > 0 && (
              <span className="text-muted-foreground line-through">${product.price}</span>
            )}
          </div>
          <p className="mt-6 text-muted-foreground leading-relaxed">{product.description}</p>

          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.25em] mb-3">Size</p>
            <div className="flex gap-2 flex-wrap">
              {product.sizes.map((s) => {
                const sizeSoldOut = !isSizeAvailable(product, s);
                return (
                  <button
                    key={s}
                    onClick={() => {
                      setSize(s);
                      setQty(1);
                    }}
                    disabled={sizeSoldOut}
                    aria-label={sizeSoldOut ? `${s} — sold out` : s}
                    title={sizeSoldOut ? "Sold out" : undefined}
                    className={`relative overflow-hidden min-w-12 h-10 px-3 border text-sm ${
                      size === s && !sizeSoldOut
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:border-primary"
                    } ${sizeSoldOut ? "opacity-40 line-through cursor-not-allowed hover:border-border" : ""}`}
                  >
                    {s}
                    {/* Diagonal cross-out for sold-out sizes */}
                    {sizeSoldOut && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-[20deg] bg-foreground/60"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            {soldOut ? (
              <p className="text-xs text-destructive mt-3">This piece is sold out.</p>
            ) : (
              outOfStock && (
                <p className="text-xs text-destructive mt-3">
                  Size {size} is sold out — please choose another size.
                </p>
              )
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.25em] mb-3">Quantity</p>
            <div className="inline-flex items-center border border-border">
              <button
                onClick={() => setQty((n) => Math.max(1, n - 1))}
                className="p-3 text-primary"
                aria-label="Decrease"
              >
                <Minus className="size-3" />
              </button>
              <span className="w-10 text-center text-sm">{qty}</span>
              <button
                onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))}
                disabled={outOfStock || qty >= MAX_QTY}
                className="p-3 text-primary disabled:opacity-40"
                aria-label="Increase"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <Button
              size="lg"
              disabled={outOfStock}
              className="flex-1 uppercase tracking-[0.2em] text-xs h-12"
              onClick={() => addToCart(product.id, size, qty)}
            >
              {soldOut ? "Sold Out" : outOfStock ? "Size Sold Out" : "Add to Cart"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-12 p-0 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={() => toggleWishlist(product.id)}
              aria-label="Wishlist"
            >
              <Heart className={wished ? "fill-current" : ""} />
            </Button>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div className="flex flex-col items-center gap-1 text-center">
              <RotateCcw className="size-5 text-primary" />
              30-Day Returns
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <ShieldCheck className="size-5 text-primary" />
              Secure Payment
            </div>
          </div>
        </div>
      </section>

      <section className="container-luxe pb-16">
        <Tabs defaultValue="description">
          {/* The four labels are wider than a phone, so the row scrolls within
              itself instead of widening the page. */}
          <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] border-b border-border bg-transparent rounded-none h-auto p-0 gap-6 md:gap-8">
            {["description", "size", "details", "shipping"].map((k) => (
              <TabsTrigger
                key={k}
                value={k}
                className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary bg-transparent pb-3 text-xs uppercase tracking-[0.2em]"
              >
                {k === "size" ? "Size Guide" : k === "shipping" ? "Shipping & Returns" : k}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent
            value="description"
            className="py-8 text-muted-foreground max-w-3xl leading-relaxed"
          >
            {product.description} Vielinea pieces are crafted in small runs using natural fibres and
            considered finishing.
          </TabsContent>
          <TabsContent value="size" className="py-8">
            <div className="grid md:grid-cols-2 gap-8 max-w-3xl">
              <div>
                <h3 className="font-display text-lg text-primary mb-3">Model Information</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border py-2">
                    <dt>Height</dt>
                    <dd>{product.model.height}</dd>
                  </div>
                  <div className="flex justify-between border-b border-border py-2">
                    <dt>Wearing Size</dt>
                    <dd>{product.model.wearingSize}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3 className="font-display text-lg text-primary mb-3">Garment Measurements</h3>
                <dl className="space-y-2 text-sm">
                  {Object.entries(product.measurements as Record<string, string>).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-border py-2">
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="details" className="py-8 text-muted-foreground max-w-3xl">
            <ul className="space-y-2 text-sm list-disc list-inside">
              <li>Made from natural fibres, ethically sourced</li>
              <li>Dry clean recommended for longevity</li>
              <li>Designed in Paris, crafted in Portugal</li>
            </ul>
          </TabsContent>
          <TabsContent
            value="shipping"
            className="py-8 text-muted-foreground max-w-3xl text-sm space-y-3"
          >
            <p>Standard shipping is charged at checkout. Express delivery available at checkout.</p>
            <p>
              30-day returns on unworn items with original tags. See our returns page for details.
            </p>
          </TabsContent>
        </Tabs>
      </section>

      {related.length > 0 && (
        <section className="container-luxe pb-24">
          <h2 className="font-display text-3xl mb-8">You May Also Like</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
      <ProductReviews productId={product.id} productTitle={product.title} />
    </Shell>
  );
}
