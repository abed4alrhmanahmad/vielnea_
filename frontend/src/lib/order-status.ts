/**
 * Presentation for the order statuses the database actually stores.
 *
 * The six values here mirror the CHECK constraint on public.orders.status and
 * the zod enum the API validates against. Nothing in the customer UI decides a
 * status — every screen renders whatever the API returned, and these helpers
 * only choose the wording and colour for it.
 */
import type { ApiOrder } from "@/lib/api/types";

export type OrderStatus = ApiOrder["status"];

/** Progression an order moves through. `cancelled` sits outside it. */
export const ORDER_TIMELINE: readonly OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
];

interface StatusPresentation {
  label: string;
  /** What the shopper should understand from this state. */
  description: string;
  /** Tailwind classes for the badge, in the Vielinea palette. */
  className: string;
}

const PRESENTATION: Record<OrderStatus, StatusPresentation> = {
  pending: {
    label: "Pending",
    description: "We have your order and are waiting for it to be confirmed.",
    className: "bg-secondary text-foreground border-border",
  },
  paid: {
    label: "Confirmed",
    description: "Your order is confirmed and queued for our atelier.",
    className: "bg-primary/10 text-primary border-primary/25",
  },
  processing: {
    label: "Processing",
    description: "Your pieces are being prepared and packed.",
    className: "bg-primary/10 text-primary border-primary/25",
  },
  shipped: {
    label: "Shipped",
    description: "Your order is on its way to you.",
    className: "bg-primary/15 text-primary border-primary/30",
  },
  delivered: {
    label: "Delivered",
    description: "Your order has been delivered. We hope you love it.",
    className: "bg-primary text-primary-foreground border-transparent",
  },
  cancelled: {
    label: "Cancelled",
    description: "This order was cancelled. Nothing has been charged.",
    className: "bg-destructive/10 text-destructive border-destructive/25",
  },
};

/** Falls back gracefully if the API ever grows a status this build predates. */
export function orderStatus(status: string): StatusPresentation {
  return (
    PRESENTATION[status as OrderStatus] ?? {
      label: status.charAt(0).toUpperCase() + status.slice(1),
      description: "",
      className: "bg-secondary text-foreground border-border",
    }
  );
}

/**
 * How far along the timeline this status is, for the progress indicator.
 * Returns -1 for a status that is not part of the progression (cancelled).
 */
export function orderTimelineIndex(status: string): number {
  return ORDER_TIMELINE.indexOf(status as OrderStatus);
}

export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatOrderDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}
