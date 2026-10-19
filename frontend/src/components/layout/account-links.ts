import { Heart, LayoutGrid, MessageCircle, Package, User } from "lucide-react";

/**
 * The signed-in account destinations, shared by the mobile navigation sheet
 * and the desktop account menu.
 *
 * Kept in its own module so `header.tsx` and the lazily loaded
 * `account-menu.tsx` can both read it without the header pulling the menu —
 * and the Radix dropdown it depends on — into the initial bundle.
 */
export const ACCOUNT_LINKS = [
  { to: "/account", label: "My Account", icon: LayoutGrid },
  { to: "/account/orders", label: "My Orders", icon: Package },
  { to: "/account/wishlist", label: "Wishlist", icon: Heart },
  { to: "/account/messages", label: "Messages", icon: MessageCircle },
  { to: "/account/profile", label: "Profile", icon: User },
] as const;

export type AccountLink = (typeof ACCOUNT_LINKS)[number];
