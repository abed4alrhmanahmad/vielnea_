/**
 * Order status and payment status are two independent columns
 * (orders.status, orders.payment_status) and the server keeps them that way:
 * neither update touches the other, and checkout sets both. A card order
 * starts as paid/paid; a Cash on Delivery order as pending/pending and stays
 * payment-pending through shipping until the courier's cash is settled.
 *
 * So nothing here changes either field. It only names the one combination
 * that contradicts itself — the order says "paid" while its payment says
 * "pending" — so the Orders screen can flag it and confirm before creating it.
 *
 * Kept free of React and of "@/" imports so it can be unit-tested directly.
 */
export type OrderStatusValue =
  "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

export type PaymentStatusValue = "pending" | "paid";

export function statusConflict(
  status: OrderStatusValue,
  paymentStatus: PaymentStatusValue,
): string | null {
  if (status === "paid" && paymentStatus === "pending") {
    return "Order status is “paid” but the payment is still pending";
  }
  return null;
}
