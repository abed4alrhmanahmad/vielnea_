import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import type { Product } from "@/data/products";
import { useStore } from "@/contexts/store-context";
import { IMAGE_SIZES, ResponsiveImage } from "@/components/responsive-image";
import { isSoldOut } from "@/lib/availability";

export function ProductCard({ product }: { product: Product }) {
  const { toggleWishlist, isWishlisted } = useStore();
  const wished = isWishlisted(product.id);
  const finalPrice = product.price * (1 - product.discount / 100);
  // Sold-out products stay listed; the badge says so, the product page blocks purchase.
  const soldOut = isSoldOut(product);

  return (
    <motion.article whileHover={{ y: -4 }} transition={{ duration: 0.3 }} className="group">
      <Link
        to="/product/$id"
        params={{ id: product.id }}
        className="relative block aspect-[3/4] overflow-hidden bg-secondary rounded-md"
      >
        {/* A product with no image yet would otherwise render an <img> with no
            src, which paints the browser's broken-image icon and the alt text.
            Falls back to the same wordmark placeholder the accessory card
            already uses, so an incomplete product looks deliberate. */}
        {product.images[0] ? (
          <ResponsiveImage
            src={product.images[0]}
            alt={product.title}
            sizes={IMAGE_SIZES.card}
            loading="lazy"
            className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Vielinea
          </span>
        )}
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {soldOut && (
            <span className="bg-foreground text-background text-[10px] font-medium uppercase tracking-widest px-2 py-1">
              Sold out
            </span>
          )}
          {product.isNew && (
            <span className="bg-primary text-primary-foreground text-[10px] uppercase tracking-widest px-2 py-1">
              New
            </span>
          )}
          {product.discount > 0 && (
            <span className="bg-foreground text-background text-[10px] uppercase tracking-widest px-2 py-1">
              -{product.discount}%
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleWishlist(product.id);
          }}
          aria-label="Toggle wishlist"
          className="absolute top-3 right-3 size-9 rounded-full bg-background/90 flex items-center justify-center text-primary hover:bg-background"
        >
          <Heart className={`size-4 ${wished ? "fill-primary" : ""}`} />
        </button>
      </Link>
      <div className="pt-4 space-y-1">
        <Link
          to="/product/$id"
          params={{ id: product.id }}
          className="block font-display text-base text-foreground hover:text-primary"
        >
          {product.title}
        </Link>
        <div className="flex items-baseline gap-2 text-sm">
          <span className="text-primary font-medium">${finalPrice.toFixed(0)}</span>
          {product.discount > 0 && (
            <span className="text-muted-foreground line-through text-xs">${product.price}</span>
          )}
        </div>
      </div>
    </motion.article>
  );
}
