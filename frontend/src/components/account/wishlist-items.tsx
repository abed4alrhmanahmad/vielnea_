/**
 * The saved-pieces list, shared by /wishlist and /account/wishlist.
 *
 * State comes from the store context: the Supabase-backed wishlist for a
 * signed-in shopper, the guest list otherwise. Nothing is mocked.
 */
import { Link } from "@tanstack/react-router";
import { Heart, Loader2, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/contexts/store-context";
import { IMAGE_SIZES, ResponsiveImage } from "@/components/responsive-image";

export function WishlistItems() {
  const { wishlistItems, toggleWishlist, moveWishlistToCart, wishlistLoading } = useStore();

  if (wishlistLoading) {
    return (
      <div className="border border-border rounded bg-card p-12 flex justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (wishlistItems.length === 0) {
    return (
      <div className="border border-border rounded bg-card p-12 text-center">
        <Heart className="size-12 mx-auto text-primary mb-4" />
        <p className="text-muted-foreground">Your wishlist is empty.</p>
        <Button asChild className="mt-6 uppercase tracking-[0.2em] text-xs">
          <Link to="/shop">Discover the collection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {wishlistItems.map((product) => {
        const price = product.price * (1 - product.discount / 100);
        return (
          <div key={product.id} className="flex gap-4 bg-card border border-border p-4 rounded">
            <Link
              to="/product/$id"
              params={{ id: product.id }}
              className="w-24 h-32 shrink-0 overflow-hidden bg-secondary rounded"
            >
              <ResponsiveImage
                src={product.images[0]}
                alt={product.title}
                sizes={IMAGE_SIZES.lineItem}
                loading="lazy"
                className="size-full object-cover"
              />
            </Link>
            <div className="flex-1 min-w-0 flex flex-col">
              <Link
                to="/product/$id"
                params={{ id: product.id }}
                className="font-display text-lg hover:text-primary"
              >
                {product.title}
              </Link>
              <p className="text-primary mt-1">${price.toFixed(0)}</p>
              <div className="mt-auto pt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => moveWishlistToCart(product.id)}>
                  <ShoppingBag className="size-3.5" /> Add to Cart
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleWishlist(product.id)}>
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
