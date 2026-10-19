import { Link } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCOUNT_LINKS } from "./account-links";
import type { AuthUser } from "@/contexts/store-context";

/**
 * The desktop account menu, in its own module so the header can load it on
 * demand.
 *
 * It only ever renders for a signed-in visitor, and the session is resolved
 * on the client (`/auth/me` stays disabled until hydration), so the Radix
 * dropdown this depends on is never needed to paint the first screen — for a
 * signed-out visitor it was ~30 KB of the initial bundle that nothing used.
 *
 * The markup is unchanged from the copy that lived in `header.tsx`; the whole
 * trigger-plus-content subtree moved together so Radix keeps its context.
 */
export default function AccountMenu({
  user,
  onSignOut,
}: {
  user: AuthUser;
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Account menu" className="p-2 hover:text-primary-dark">
          <User className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm">{user.name}</span>
          <span className="block text-xs text-muted-foreground truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCOUNT_LINKS.map((link) => (
          <DropdownMenuItem key={link.to} asChild>
            <Link to={link.to} className="cursor-pointer">
              <link.icon className="size-4" />
              {link.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
          <LogOut className="size-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
