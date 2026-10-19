/**
 * My Orders.
 *
 * Reads GET /api/orders, which the server scopes to the signed-in customer.
 * The status shown on each row is the value stored in the database, so an
 * admin's change appears here on the next load.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, Package, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/account/error-panel";
import { useStore } from "@/contexts/store-context";
import { useOrders } from "@/services/orders";
import { errorMessage } from "@/lib/api/client";
import { formatMoney, formatOrderDate, orderStatus } from "@/lib/order-status";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/payment";

export const Route = createFileRoute("/account/orders/")({
  head: () => ({
    meta: [{ title: "My Orders — Vielinea" }, { name: "robots", content: "noindex" }],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { isAuthenticated } = useStore();
  const ordersQuery = useOrders(isAuthenticated);
  const orders = ordersQuery.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl">My Orders</h2>
        <button
          onClick={() => void ordersQuery.refetch()}
          disabled={ordersQuery.isFetching}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {ordersQuery.isPending ? (
        <div className="mt-6 border border-border rounded bg-card p-12 flex justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : ordersQuery.isError ? (
        <div className="mt-6">
          <ErrorPanel
            message={errorMessage(ordersQuery.error, "We couldn't load your orders")}
            onRetry={() => void ordersQuery.refetch()}
          />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-6 border border-border rounded bg-card p-12 text-center">
          <Package className="size-12 mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">You haven't placed an order yet.</p>
          <Button asChild className="mt-6 uppercase tracking-[0.2em] text-xs">
            <Link to="/shop">Discover the collection</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => {
            const status = orderStatus(order.status);
            const units = order.items.reduce((n, item) => n + item.quantity, 0);
            return (
              <li key={order.id}>
                <Link
                  to="/account/orders/$id"
                  params={{ id: order.id }}
                  className="block border border-border rounded bg-card p-5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm text-primary">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatOrderDate(order.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {paymentMethodLabel(order.paymentMethod)} ·{" "}
                        {paymentStatusLabel(order.paymentStatus)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] uppercase tracking-[0.15em] ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  {/* Thumbnails give the row a glance-value the numbers can't. */}
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex -space-x-3">
                      {order.items
                        .slice(0, 4)
                        .map((item) =>
                          item.imageUrl ? (
                            <img
                              key={item.id}
                              src={item.imageUrl}
                              alt=""
                              className="size-12 rounded object-cover border border-border bg-secondary"
                            />
                          ) : (
                            <span
                              key={item.id}
                              className="size-12 rounded border border-border bg-secondary"
                            />
                          ),
                        )}
                      {order.items.length > 4 && (
                        <span className="size-12 rounded border border-border bg-secondary text-xs text-muted-foreground flex items-center justify-center">
                          +{order.items.length - 4}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {units} item{units === 1 ? "" : "s"}
                      <div className="text-primary font-medium">{formatMoney(order.total)}</div>
                    </div>
                    <span className="ml-auto text-[11px] uppercase tracking-[0.2em] text-primary inline-flex items-center gap-1.5">
                      <span className="hidden sm:inline">Details</span>
                      <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
