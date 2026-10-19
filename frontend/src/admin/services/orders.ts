/**
 * Admin order management, backed by the Express API (Supabase).
 * Export shape is unchanged from the previous localStorage service.
 */
import { apiClient, adminKeys, runAdminMutation, useAdminList } from "../lib/api-hooks";
import type { ApiOrder } from "@/lib/api/types";
import type { PaymentMethod, PaymentStatus } from "@/lib/payment";

/**
 * The full set the database stores and the API accepts. `paid` and `shipped`
 * used to be missing here, which meant every freshly paid order was displayed
 * as "processing" and no order could ever be marked shipped — the customer's
 * order page and this one disagreed about the same row.
 */
export type OrderStatus = "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

export interface OrderItem {
  productId: string;
  title: string;
  size: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  discount: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /**
   * Safe payment metadata only — the provider's reference, the brand and the
   * last four digits. There is no full card number or CVV anywhere in the
   * system for an admin to see.
   */
  paymentReference: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  address: string;
  createdAt: number;
}

function toAdminOrder(api: ApiOrder): Order {
  return {
    id: api.id,
    orderNumber: api.orderNumber,
    customerId: api.userId,
    customerName: api.customerName,
    customerEmail: api.email,
    items: api.items.map((i) => ({
      productId: i.productSlug ?? i.productId ?? "",
      title: i.productTitle,
      size: i.size ?? "—",
      quantity: i.quantity,
      price: i.unitPrice,
    })),
    subtotal: api.subtotal,
    shipping: api.shipping,
    total: api.total,
    discount: api.discount,
    status: api.status,
    paymentMethod: api.paymentMethod,
    paymentStatus: api.paymentStatus,
    paymentReference: api.paymentReference,
    cardBrand: api.cardBrand,
    cardLast4: api.cardLast4,
    address: [api.address, api.city, api.country].filter(Boolean).join(", "),
    createdAt: new Date(api.createdAt).getTime(),
  };
}

export const ordersService = {
  list(): Order[] {
    return [];
  },

  async fetch(): Promise<Order[]> {
    const rows = await apiClient.get<ApiOrder[]>("/admin/orders", { params: { limit: 200 } });
    return rows.map(toAdminOrder);
  },

  get(): Order | undefined {
    return undefined;
  },

  async getAsync(id: string): Promise<Order | undefined> {
    try {
      return toAdminOrder(await apiClient.get<ApiOrder>(`/admin/orders/${id}`));
    } catch {
      return undefined;
    }
  },

  updateStatus(id: string, status: OrderStatus): void {
    runAdminMutation(() => apiClient.put(`/admin/orders/${id}/status`, { status }), {
      invalidate: [adminKeys.orders, adminKeys.stats, adminKeys.customers, ["orders"]],
      success: `Order marked ${status}`,
      failure: "Could not update the order status",
    });
  },

  /**
   * Settles a Cash-on-Delivery order once the courier has collected the money.
   * Separate from updateStatus so marking an order paid never moves the order's
   * own status, and vice versa.
   */
  updatePaymentStatus(id: string, paymentStatus: PaymentStatus): void {
    runAdminMutation(() => apiClient.put(`/admin/orders/${id}/payment-status`, { paymentStatus }), {
      invalidate: [adminKeys.orders, adminKeys.stats, adminKeys.customers, ["orders"]],
      success: paymentStatus === "paid" ? "Payment marked paid" : "Payment marked pending",
      failure: "Could not update the payment status",
    });
  },

  key: "admin-orders",
};

export function useOrders(): Order[] {
  return useAdminList<ApiOrder, Order>(adminKeys.orders, "/admin/orders?limit=200", (rows) =>
    rows.map(toAdminOrder),
  );
}
