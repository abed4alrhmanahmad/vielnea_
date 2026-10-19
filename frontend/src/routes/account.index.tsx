/**
 * Account overview.
 *
 * Every figure on this page is derived from live API responses — orders from
 * /api/orders, saved pieces from /api/wishlist (via the store context) and the
 * unread count from /api/chat/unread. Nothing is seeded or hardcoded.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Heart, Loader2, MessageCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/account/error-panel";
import { useStore } from "@/contexts/store-context";
import { useOrders } from "@/services/orders";
import { useChatUnread } from "@/services/chat";
import { errorMessage } from "@/lib/api/client";
import { formatMoney, formatOrderDate, orderStatus } from "@/lib/order-status";

export const Route = createFileRoute("/account/")({
  head: () => ({
    meta: [{ title: "My Account — Vielinea" }, { name: "robots", content: "noindex" }],
  }),
  component: AccountOverview,
});

const OPEN_STATUSES = new Set(["pending", "paid", "processing", "shipped"]);

function AccountOverview() {
  const { isAuthenticated, wishlist, user } = useStore();
  const ordersQuery = useOrders(isAuthenticated);
  const unread = useChatUnread(isAuthenticated).data?.unread ?? 0;

  const orders = ordersQuery.data ?? [];
  const openOrders = orders.filter((order) => OPEN_STATUSES.has(order.status)).length;
  const latest = orders[0];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          icon={<Package className="size-4" />}
          label="Orders placed"
          value={ordersQuery.isPending ? "—" : String(orders.length)}
          hint={openOrders > 0 ? `${openOrders} in progress` : "All up to date"}
          to="/account/orders"
        />
        <StatTile
          icon={<Heart className="size-4" />}
          label="Saved pieces"
          value={String(wishlist.length)}
          hint={wishlist.length === 0 ? "Nothing saved yet" : "In your wishlist"}
          to="/account/wishlist"
        />
        <StatTile
          icon={<MessageCircle className="size-4" />}
          label="Messages"
          value={unread > 0 ? String(unread) : "0"}
          hint={unread > 0 ? "Unread replies" : "No unread replies"}
          to="/account/messages"
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl">Latest order</h2>
          {orders.length > 0 && (
            <Link
              to="/account/orders"
              className="text-[11px] uppercase tracking-[0.2em] text-primary hover:underline underline-offset-4"
            >
              View all
            </Link>
          )}
        </div>

        <div className="mt-4">
          {ordersQuery.isPending ? (
            <div className="border border-border rounded bg-card p-10 flex justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : ordersQuery.isError ? (
            <ErrorPanel
              message={errorMessage(ordersQuery.error, "We couldn't load your orders")}
              onRetry={() => void ordersQuery.refetch()}
            />
          ) : !latest ? (
            <div className="border border-border rounded bg-card p-10 text-center">
              <Package className="size-10 mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">You haven't placed an order yet.</p>
              <Button asChild className="mt-6 uppercase tracking-[0.2em] text-xs">
                <Link to="/shop">Discover the collection</Link>
              </Button>
            </div>
          ) : (
            <Link
              to="/account/orders/$id"
              params={{ id: latest.id }}
              className="block border border-border rounded bg-card p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-primary">{latest.orderNumber}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Placed {formatOrderDate(latest.createdAt)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.15em] ${orderStatus(latest.status).className}`}
                >
                  {orderStatus(latest.status).label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                {latest.items.reduce((n, item) => n + item.quantity, 0)} item
                {latest.items.reduce((n, item) => n + item.quantity, 0) === 1 ? "" : "s"} ·{" "}
                <span className="text-primary font-medium">{formatMoney(latest.total)}</span>
              </p>
              <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-primary inline-flex items-center gap-1.5">
                View details <ArrowRight className="size-3.5" />
              </p>
            </Link>
          )}
        </div>
      </section>

      <section className="border border-border rounded bg-card p-5">
        <h2 className="font-display text-xl">Account details</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Name</dt>
            <dd className="mt-1">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Email</dt>
            <dd className="mt-1 break-all">{user?.email}</dd>
          </div>
        </dl>
        <Button
          asChild
          variant="outline"
          className="mt-5 border-primary text-primary uppercase tracking-[0.2em] text-xs"
        >
          <Link to="/account/profile">Edit profile</Link>
        </Button>
      </section>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  to: "/account/orders" | "/account/wishlist" | "/account/messages";
}) {
  return (
    <Link
      to={to}
      className="border border-border rounded bg-card p-5 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.2em]">{label}</span>
      </div>
      <p className="font-display text-3xl mt-3">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </Link>
  );
}
