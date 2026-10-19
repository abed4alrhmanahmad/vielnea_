import type { PoolClient } from "pg";
import { queryMany, queryOne } from "../lib/db.js";
import type {
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../types/models.js";

interface OrderRow {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  card_brand: string | null;
  card_last4: string | null;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  created_at: Date;
  items: OrderItemRow[] | null;
}

interface OrderItemRow {
  id: string;
  productId: string | null;
  productTitle: string;
  productSlug: string | null;
  imageUrl: string | null;
  size: string | null;
  quantity: number;
  unitPrice: string | number;
  totalPrice: string | number;
}

const ORDER_SELECT = `
  SELECT o.id, o.order_number, o.user_id, o.status,
         o.subtotal, o.discount, o.shipping, o.total,
         o.payment_method, o.payment_status,
         o.payment_reference, o.card_brand, o.card_last4,
         o.customer_name, o.email, o.phone, o.address, o.city,
         o.postal_code, o.country, o.notes, o.created_at,
         it.items
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'id', oi.id, 'productId', oi.product_id,
               'productTitle', oi.product_title, 'productSlug', oi.product_slug,
               'imageUrl', oi.image_url, 'size', oi.size,
               'quantity', oi.quantity, 'unitPrice', oi.unit_price,
               'totalPrice', oi.total_price
             ) ORDER BY oi.created_at, oi.product_title
           ) AS items
    FROM public.order_items oi WHERE oi.order_id = o.id
  ) it ON true
`;

function mapItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.productId,
    productTitle: row.productTitle,
    productSlug: row.productSlug,
    imageUrl: row.imageUrl,
    size: row.size,
    quantity: row.quantity,
    unitPrice: Number(row.unitPrice),
    totalPrice: Number(row.totalPrice),
  };
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    status: row.status,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    shipping: Number(row.shipping),
    total: Number(row.total),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    paymentReference: row.payment_reference,
    cardBrand: row.card_brand,
    cardLast4: row.card_last4,
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    notes: row.notes,
    items: (row.items ?? []).map(mapItem),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export const orderRepository = {
  async findByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ orders: Order[]; total: number }> {
    const countRow = await queryOne<{ total: number }>(
      "SELECT count(*)::int AS total FROM public.orders WHERE user_id = $1",
      [userId],
    );
    const rows = await queryMany<OrderRow>(
      `${ORDER_SELECT} WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit],
    );
    return { orders: rows.map(mapOrder), total: countRow?.total ?? 0 };
  },

  /** Scoped by user so one customer can never read another's order. */
  async findByIdForUser(orderId: string, userId: string): Promise<Order | null> {
    const row = await queryOne<OrderRow>(
      `${ORDER_SELECT} WHERE o.id = $1 AND o.user_id = $2 LIMIT 1`,
      [orderId, userId],
    );
    return row ? mapOrder(row) : null;
  },

  async findByIdAsAdmin(orderId: string): Promise<Order | null> {
    const row = await queryOne<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1 LIMIT 1`, [orderId]);
    return row ? mapOrder(row) : null;
  },

  /** Admin: every order, optionally filtered by status or customer. */
  async findAll(
    page: number,
    limit: number,
    filters: { status?: string | undefined; search?: string | undefined } = {},
  ): Promise<{ orders: Order[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`o.status = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(
        `(o.customer_name ILIKE $${params.length} OR o.email ILIKE $${params.length} OR o.order_number ILIKE $${params.length})`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await queryOne<{ total: number }>(
      `SELECT count(*)::int AS total FROM public.orders o ${where}`,
      params,
    );
    const rows = await queryMany<OrderRow>(
      `${ORDER_SELECT} ${where} ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    );
    return { orders: rows.map(mapOrder), total: countRow?.total ?? 0 };
  },

  async updateStatus(orderId: string, status: string): Promise<Order | null> {
    const row = await queryOne<{ id: string }>(
      "UPDATE public.orders SET status = $2 WHERE id = $1 RETURNING id",
      [orderId, status],
    );
    if (!row) return null;
    return this.findByIdAsAdmin(orderId);
  },

  /** Admin-only: settle (or un-settle) an order's payment. */
  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<Order | null> {
    const row = await queryOne<{ id: string }>(
      "UPDATE public.orders SET payment_status = $2 WHERE id = $1 RETURNING id",
      [orderId, paymentStatus],
    );
    if (!row) return null;
    return this.findByIdAsAdmin(orderId);
  },

  async findByIdInTransaction(client: PoolClient, orderId: string): Promise<Order | null> {
    const result = await client.query<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1 LIMIT 1`, [
      orderId,
    ]);
    const row = result.rows[0];
    return row ? mapOrder(row) : null;
  },

  mapOrder,
};
