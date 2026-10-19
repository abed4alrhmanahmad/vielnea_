import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { ApiOrder } from "@/lib/api/types";
import type { PaymentMethod } from "@/lib/payment";
import type { CardToken } from "@/lib/payments/card";

export interface CheckoutInput {
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  /**
   * Which payment route to take. The server validates it and decides the
   * resulting payment state — nothing about payment is trusted from here.
   */
  paymentMethod: PaymentMethod;
  /**
   * Present only for card payments. Carries the provider token and the safe
   * descriptors — never the card number or the CVV.
   */
  card?: CardToken;
  /** Stable per checkout attempt so a retry cannot charge twice. */
  idempotencyKey?: string;
}

export const orderKeys = {
  all: ["orders"] as const,
  detail: (id: string) => ["orders", id] as const,
};

export async function fetchOrders(): Promise<ApiOrder[]> {
  return apiClient.get<ApiOrder[]>("/orders");
}

export async function fetchOrder(id: string): Promise<ApiOrder> {
  return apiClient.get<ApiOrder>(`/orders/${id}`);
}

/** Totals in the response are the server's, not the browser's. */
export async function createOrder(input: CheckoutInput): Promise<ApiOrder> {
  return apiClient.post<ApiOrder>("/orders", input);
}

export function useOrders(enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.all,
    queryFn: fetchOrders,
    enabled,
    // Short, so an admin status change shows up on the customer's next visit
    // to the page rather than being served from a long-lived cache.
    staleTime: 15_000,
  });
}

/**
 * One order, by id. The API scopes this to the signed-in customer, so an id
 * belonging to somebody else comes back as a 404 rather than as data.
 */
export function useOrder(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? "none"),
    queryFn: async () => fetchOrder(id!),
    enabled: enabled && Boolean(id),
    staleTime: 15_000,
    retry: false,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      // Checkout empties the cart and consumes stock, so both are now stale.
      void queryClient.invalidateQueries({ queryKey: ["cart"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}
