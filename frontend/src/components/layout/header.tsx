import { lazy, Suspense, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Search, Heart, ShoppingBag, User, Menu, X, LogOut } from "lucide-react";
import { Logo } from "./logo";
import { useStore } from "@/contexts/store-context";
import { Input } from "@/components/ui/input";
import { useSiteSettings } from "@/services/site-content";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ACCOUNT_LINKS } from "./account-links";

/**
 * The account menu renders only for a signed-in visitor, and the session is
 * resolved after hydration, so it is never part of the first paint. Loading it
 * on demand keeps the Radix dropdown out of the initial bundle.
 */
const AccountMenu = lazy(() => import("./account-menu"));

/**
 * Splits a CMS href like "/shop?gift=1" into the route and its search params,
 * so admin-managed links keep working with TanStack Router's typed navigation.
 */
function parseNavHref(href: string): { to: string; search?: Record<string, string> } {
  const [path, query] = href.split("?");
  const to = path || "/";
  if (!query) return { to };
  const search: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) search[key] = value;
  return { to, search };
}

/** Account links shown once the shopper is signed in. */
export function Header() {
  const { cartCount, wishlist, user, authReady, logout } = useStore();
  const site = useSiteSettings();
  // Navigation is CMS-managed: labels, order and visibility come from the database.
  const nav = site.header.nav
    .filter((n) => n.enabled)
    .map((n) => ({ label: n.label, ...parseNavHref(n.href) }));
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [openSearch, setOpenSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate({ to: "/shop", search: { q: query.trim() } });
    setOpenSearch(false);
    setMobileOpen(false);
  };

  const signOut = () => {
    logout();
    setMobileOpen(false);
    void navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      {site.announcement.enabled && site.announcement.text && (
        <div className="bg-primary text-primary-foreground text-xs text-center py-2 tracking-[0.15em] uppercase">
          {site.announcement.text}
        </div>
      )}
      <div className="container-luxe flex items-center justify-between h-16 gap-6">
        <div className="flex items-center gap-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button aria-label="Open menu" className="lg:hidden text-primary p-2 -ml-2">
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px]">
              <SheetHeader>
                <SheetTitle className="font-display text-primary">Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1">
                {nav.map((n, i) => (
                  <Link
                    key={i}
                    to={n.to}
                    search={n.search as never}
                    onClick={() => setMobileOpen(false)}
                    className="py-3 px-2 text-sm uppercase tracking-[0.2em] text-foreground hover:text-primary border-b border-border"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <form onSubmit={submitSearch} className="mt-6">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                />
              </form>

              {/* The same account controls as the desktop row, so the mobile
                  menu is not a reduced version of the site. */}
              {authReady && (
                <div className="mt-8 border-t border-border pt-4">
                  {user ? (
                    <>
                      <p className="px-2 text-xs text-muted-foreground truncate">{user.email}</p>
                      <nav className="mt-2 flex flex-col">
                        {ACCOUNT_LINKS.map((link) => (
                          <Link
                            key={link.to}
                            to={link.to}
                            onClick={() => setMobileOpen(false)}
                            className="flex items-center gap-2.5 py-3 px-2 text-sm uppercase tracking-[0.2em] text-foreground hover:text-primary"
                          >
                            <link.icon className="size-4" />
                            {link.label}
                          </Link>
                        ))}
                        <button
                          onClick={signOut}
                          className="flex items-center gap-2.5 py-3 px-2 text-sm uppercase tracking-[0.2em] text-muted-foreground hover:text-primary text-left"
                        >
                          <LogOut className="size-4" />
                          Logout
                        </button>
                      </nav>
                    </>
                  ) : (
                    <nav className="flex flex-col">
                      <Link
                        to="/login"
                        onClick={() => setMobileOpen(false)}
                        className="py-3 px-2 text-sm uppercase tracking-[0.2em] text-foreground hover:text-primary"
                      >
                        Login
                      </Link>
                      <Link
                        to="/register"
                        onClick={() => setMobileOpen(false)}
                        className="py-3 px-2 text-sm uppercase tracking-[0.2em] text-primary hover:text-primary-dark"
                      >
                        Sign Up
                      </Link>
                    </nav>
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>
          <Logo imgClassName="h-9 md:h-10 translate-y-[6.4%]" />
        </div>

        {/* Full nav from lg: at md widths the five labels wrap onto two lines,
            so tablets use the menu sheet like phones. */}
        <nav className="hidden lg:flex items-center gap-7">
          {nav.map((n, i) => {
            const active = pathname === n.to && !n.search;
            return (
              <Link
                key={i}
                to={n.to}
                search={n.search as never}
                className={`text-[11px] uppercase tracking-[0.25em] transition-colors ${
                  active ? "text-primary" : "text-foreground hover:text-primary"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 text-primary">
          <button
            aria-label="Search"
            onClick={() => setOpenSearch((v) => !v)}
            className="p-2 hover:text-primary-dark"
          >
            <Search className="size-4" />
          </button>
          {/* Account control. Its shape follows the session: a menu once
              signed in, Login / Sign Up while signed out. The placeholder
              holds the same width until the session is known, so the row
              does not shift as auth resolves. */}
          {!authReady ? (
            <span className="p-2 opacity-40" aria-hidden="true">
              <User className="size-4" />
            </span>
          ) : user ? (
            // Same icon at the same size while the chunk resolves, so the row
            // keeps its width and the mark does not flicker.
            <Suspense
              fallback={
                <span className="p-2" aria-hidden="true">
                  <User className="size-4" />
                </span>
              }
            >
              <AccountMenu user={user} onSignOut={signOut} />
            </Suspense>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden sm:inline-block px-2 text-[11px] uppercase tracking-[0.2em] text-foreground hover:text-primary"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="hidden sm:inline-block px-2 text-[11px] uppercase tracking-[0.2em] text-primary hover:text-primary-dark"
              >
                Sign Up
              </Link>
              <Link to="/login" aria-label="Sign in" className="sm:hidden p-2 hover:text-primary-dark">
                <User className="size-4" />
              </Link>
            </>
          )}
          <Link
            to="/wishlist"
            aria-label="Wishlist"
            className="relative p-2 hover:text-primary-dark"
          >
            <Heart className="size-4" />
            {wishlist.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] rounded-full size-4 flex items-center justify-center">
                {wishlist.length}
              </span>
            )}
          </Link>
          <Link to="/cart" aria-label="Cart" className="relative p-2 hover:text-primary-dark">
            <ShoppingBag className="size-4" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] rounded-full size-4 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
      {openSearch && (
        <div className="border-t border-border bg-background">
          <form onSubmit={submitSearch} className="container-luxe py-4 flex gap-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for dresses, bags, jewelry..."
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setOpenSearch(false)}
              className="p-2 text-muted-foreground hover:text-primary"
              aria-label="Close search"
            >
              <X className="size-4" />
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
