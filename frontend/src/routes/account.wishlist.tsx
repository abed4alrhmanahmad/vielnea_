/**
 * Wishlist inside the account area. Renders the same list the public
 * /wishlist page uses, so there is one implementation and one data source.
 */
import { createFileRoute } from "@tanstack/react-router";
import { WishlistItems } from "@/components/account/wishlist-items";
import { useStore } from "@/contexts/store-context";

export const Route = createFileRoute("/account/wishlist")({
  head: () => ({
    meta: [{ title: "My Wishlist — Vielinea" }, { name: "robots", content: "noindex" }],
  }),
  component: AccountWishlistPage,
});

function AccountWishlistPage() {
  const { wishlist } = useStore();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl">Wishlist</h2>
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {wishlist.length} saved
        </span>
      </div>
      <div className="mt-6">
        <WishlistItems />
      </div>
    </div>
  );
}
