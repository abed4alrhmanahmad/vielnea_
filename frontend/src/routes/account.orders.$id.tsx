/**
 * Order details.
 *
 * Reads GET /api/orders/:id. That endpoint matches on user_id as well as the
 * order id, so an id belonging to another customer returns 404 — the page
 * below never has to filter anything for privacy. Every figure rendered is the
 * one the server stored at checkout; nothing is recalculated in the browser.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/account/error-panel";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/payment";
import { useStore } from "@/contexts/store-context";
import { useOrder } from "@/services/orders";
import { ApiError, errorMessage } from "@/lib/api/client";
import {
  ORDER_TIMELINE,
  formatMoney,
  formatOrderDateTime,
  orderStatus,
  orderTimelineIndex,
} from "@/lib/order-status";

export const Route = createFileRoute("/account/orders/$id")({
  head: () => ({
    meta: [{ title: "Order Details — Vielinea" }, { name: "robots", content: "noindex" }],
  }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { id } = Route.useParams();
  const { isAuthenticated } = useStore();
  const orderQuery = useOrder(id, isAuthenticated);
  const order = orderQuery.data;

  const backLink = (
    <Link
      to="/account/orders"
      className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="size-3.5" />
      All orders
    </Link>
  );

  if (orderQuery.isPending) {
    return (
      <div>
        {backLink}
        <div className="mt-6 border border-border rounded bg-card p-12 flex justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  if (orderQuery.isError || !order) {
    const notFound = orderQuery.error instanceof ApiError && orderQuery.error.status === 404;
    return (
      <div>
        {backLink}
        <div className="mt-6">
          {notFound ? (
            <div className="border border-border rounded bg-card p-12 text-center">
              <XCircle className="size-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">We couldn't find that order on your account.</p>
              <Button asChild className="mt-6 uppercase tracking-[0.2em] text-xs">
                <Link to="/account/orders">Back to my orders</Link>
              </Button>
            </div>
          ) : (
            <ErrorPanel
              message={errorMessage(orderQuery.error, "We couldn't load this order")}
              onRetry={() => void orderQuery.refetch()}
            />
          )}
        </div>
      </div>
    );
  }

  const status = orderStatus(order.status);
  const currentStep = orderTimelineIndex(order.status);
  const units = order.items.reduce((n, item) => n + item.quantity, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        {backLink}
        <button
          onClick={() => void orderQuery.refetch()}
          disabled={orderQuery.isFetching}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${orderQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl md:text-3xl">Order {order.orderNumber}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Placed {formatOrderDateTime(order.createdAt)} · {units} item{units === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-md border px-3 py-1 text-[11px] uppercase tracking-[0.15em] ${status.className}`}
        >
          {status.label}
        </span>
      </header>

      <section className="mt-6 border border-border rounded bg-card p-5">
        <p className="text-sm text-muted-foreground">{status.description}</p>
        {currentStep >= 0 ? (
          <ol className="mt-6 flex gap-1" aria-label="Order progress">
            {ORDER_TIMELINE.map((step, index) => {
              const reached = index <= currentStep;
              return (
                <li key={step} className="flex-1 min-w-0">
                  <span
                    className={`block h-1 rounded-full ${reached ? "bg-primary" : "bg-border"}`}
                    aria-hidden="true"
                  />
                  <span
                    className={`mt-2 block text-[10px] uppercase tracking-[0.12em] truncate ${
                      index === currentStep
                        ? "text-primary font-medium"
                        : reached
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {orderStatus(step).label}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <h3 className="font-display text-xl">Items</h3>
          <ul className="mt-4 space-y-3">
            {order.items.map((item) => {
              const thumb = item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.productTitle}
                  className="size-full object-cover"
                />
              ) : null;
              return (
                <li key={item.id} className="flex gap-4 border border-border rounded bg-card p-4">
                  {/* A product can be delisted after purchase; the order keeps
                      its own copy of the title and image either way. */}
                  {item.productSlug ? (
                    <Link
                      to="/product/$id"
                      params={{ id: item.productSlug }}
                      className="w-20 h-24 shrink-0 overflow-hidden bg-secondary rounded"
                    >
                      {thumb}
                    </Link>
                  ) : (
                    <div className="w-20 h-24 shrink-0 overflow-hidden bg-secondary rounded">
                      {thumb}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {item.productSlug ? (
                      <Link
                        to="/product/$id"
                        params={{ id: item.productSlug }}
                        className="font-display text-lg hover:text-primary"
                      >
                        {item.productTitle}
                      </Link>
                    ) : (
                      <p className="font-display text-lg">{item.productTitle}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest">
                      {item.size ? `Size: ${item.size} · ` : ""}Qty: {item.quantity}
                    </p>
                    <p className="text-sm mt-3">
                      <span className="text-muted-foreground">
                        {formatMoney(item.unitPrice)} each
                      </span>
                      <span className="text-primary font-medium float-right">
                        {formatMoney(item.totalPrice)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="space-y-6">
          <div className="border border-border rounded bg-card p-5">
            <h3 className="font-display text-xl">Summary</h3>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatMoney(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd>{formatMoney(order.shipping)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2.5 text-base font-medium">
                <dt>Total</dt>
                <dd className="text-primary">{formatMoney(order.total)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-border pt-2.5">
                <dt className="text-muted-foreground">Payment method</dt>
                <dd>{paymentMethodLabel(order.paymentMethod)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Payment status</dt>
                <dd>{paymentStatusLabel(order.paymentStatus)}</dd>
              </div>
              {order.cardLast4 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Card</dt>
                  <dd>•••• {order.cardLast4}</dd>
                </div>
              )}
            </dl>
            {order.discount > 0 && (
              <p className="mt-3 text-xs text-primary">
                You saved {formatMoney(order.discount)} on item pricing.
              </p>
            )}
          </div>

          <div className="border border-border rounded bg-card p-5">
            <h3 className="font-display text-xl">Delivery</h3>
            <address className="mt-4 text-sm not-italic leading-relaxed text-muted-foreground">
              <span className="text-foreground">{order.customerName}</span>
              <br />
              {order.address}
              <br />
              {[order.city, order.postalCode].filter(Boolean).join(" ")}
              {order.country ? (
                <>
                  <br />
                  {order.country}
                </>
              ) : null}
              <br />
              {order.phone}
              <br />
              <span className="break-all">{order.email}</span>
            </address>
            {order.notes && (
              <p className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">
                <span className="uppercase tracking-[0.2em]">Notes</span>
                <br />
                {order.notes}
              </p>
            )}
          </div>

          <div className="border border-border rounded bg-card p-5">
            <h3 className="font-display text-xl">Need help?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Message our team about this order and we'll reply in your account.
            </p>
            <Button
              asChild
              variant="outline"
              className="mt-4 w-full border-primary text-primary uppercase tracking-[0.2em] text-xs"
            >
              <Link to="/account/messages">Contact support</Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
