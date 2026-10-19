/**
 * Admin customer directory, backed by the Express API (Supabase).
 *
 * Previously derived from mock orders in localStorage; now read from the users
 * table with order totals aggregated server-side. Export shape is unchanged.
 */
import { useMemo } from "react";
import { adminKeys, useAdminList } from "../lib/api-hooks";
import { useOrders, type Order } from "./orders";

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  address: string;
  role: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: number | null;
  wishlist: string[];
  wishlistCount: number;
}

interface ApiAdminCustomer {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  wishlistCount: number;
}

function toAdminCustomer(api: ApiAdminCustomer): AdminCustomer {
  return {
    id: api.id,
    name: api.name,
    email: api.email,
    role: api.role,
    address: "",
    ordersCount: api.ordersCount,
    totalSpent: api.totalSpent,
    lastOrderAt: api.lastOrderAt ? new Date(api.lastOrderAt).getTime() : null,
    wishlist: [],
    wishlistCount: api.wishlistCount,
  };
}

export function useCustomers(): AdminCustomer[] {
  return useAdminList<ApiAdminCustomer, AdminCustomer>(
    adminKeys.customers,
    "/admin/customers",
    (rows) => rows.map(toAdminCustomer),
  );
}

export function useCustomerOrders(customerId: string | null): Order[] {
  const orders = useOrders();
  return useMemo(
    () => (customerId ? orders.filter((o) => o.customerId === customerId) : []),
    [orders, customerId],
  );
}
