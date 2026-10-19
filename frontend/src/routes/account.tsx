/**
 * Customer account shell.
 *
 * Parent of every /account/* page: it applies the storefront chrome, gates the
 * whole area behind the existing session, and renders the section navigation.
 * Each child page renders through the <Outlet />.
 */
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Heart, LayoutGrid, LogOut, MessageCircle, Package, User } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { RequireAuth } from "@/components/auth/require-auth";
import { useStore } from "@/contexts/store-context";
import { useChatUnread } from "@/services/chat";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "My Account — Vielinea" },
      { name: "description", content: "Your Vielinea account, orders and saved pieces." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountLayout,
});

const SECTIONS = [
  { to: "/account", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/account/orders", label: "My Orders", icon: Package, exact: false },
  { to: "/account/wishlist", label: "Wishlist", icon: Heart, exact: false },
  { to: "/account/messages", label: "Messages", icon: MessageCircle, exact: false },
  { to: "/account/profile", label: "Profile", icon: User, exact: false },
] as const;

function AccountLayout() {
  return (
    <Shell>
      <RequireAuth>
        <AccountFrame />
      </RequireAuth>
    </Shell>
  );
}

function AccountFrame() {
  const { user, logout, wishlist } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useChatUnread(true).data?.unread ?? 0;

  const counts: Record<string, number> = {
    "/account/wishlist": wishlist.length,
    "/account/messages": unread,
  };

  const signOut = () => {
    logout();
    void navigate({ to: "/" });
  };

  return (
    <div className="container-luxe py-10 md:py-16">
      <header>
        <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-primary">My Account</span>
        </p>
        <h1 className="font-display text-4xl md:text-5xl mt-3">
          {user ? `Hello, ${user.name.split(" ")[0]}` : "My Account"}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{user?.email}</p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[220px_1fr]">
        {/* Horizontal, scrollable strip on small screens; a rail from lg up. */}
        <nav
          aria-label="Account sections"
          className="lg:sticky lg:top-24 lg:self-start -mx-4 px-4 lg:mx-0 lg:px-0 overflow-x-auto lg:overflow-visible"
        >
          <ul className="flex lg:flex-col gap-1 min-w-max lg:min-w-0 border-b border-border lg:border-b-0 pb-2 lg:pb-0">
            {SECTIONS.map((section) => {
              const active = section.exact
                ? pathname === section.to
                : pathname.startsWith(section.to);
              const count = counts[section.to] ?? 0;
              return (
                <li key={section.to}>
                  <Link
                    to={section.to}
                    className={`flex items-center gap-2.5 whitespace-nowrap px-3 py-2.5 rounded text-[11px] uppercase tracking-[0.2em] transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:text-primary hover:bg-secondary/60"
                    }`}
                  >
                    <section.icon className="size-4 shrink-0" />
                    {section.label}
                    {count > 0 && (
                      <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                        {count > 9 ? "9+" : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                onClick={signOut}
                className="w-full flex items-center gap-2.5 whitespace-nowrap px-3 py-2.5 rounded text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary hover:bg-secondary/60 transition-colors"
              >
                <LogOut className="size-4 shrink-0" />
                Logout
              </button>
            </li>
          </ul>
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
