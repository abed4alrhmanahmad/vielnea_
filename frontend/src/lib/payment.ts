/**
 * Shared vocabulary for how an order is paid for.
 *
 * The storefront confirmation, the customer's order pages and the admin panel
 * all label these the same way, so a single source keeps them from drifting.
 */
export type PaymentMethod = "card" | "cod";
export type PaymentStatus = "pending" | "paid";

export function paymentMethodLabel(method: PaymentMethod): string {
  return method === "cod" ? "Cash on Delivery" : "Visa / Card";
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return status === "paid" ? "Paid" : "Pending";
}
