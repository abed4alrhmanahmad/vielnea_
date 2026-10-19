import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { WishlistItems } from "@/components/account/wishlist-items";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: "My Wishlist — Vielinea" },
      { name: "description", content: "Your saved Vielinea favourites." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  return (
    <Shell>
      <div className="container-luxe py-16">
        <h1 className="font-display text-4xl md:text-5xl text-center">My Wishlist</h1>
        <p className="text-center text-muted-foreground mt-3">Pieces you've saved for later</p>

        <div className="mt-12 max-w-3xl mx-auto">
          <WishlistItems />
        </div>
      </div>
    </Shell>
  );
}
