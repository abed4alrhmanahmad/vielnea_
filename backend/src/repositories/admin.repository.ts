import { queryMany, queryOne } from "../lib/db.js";

export interface DashboardStats {
  revenue: { total: number; last30Days: number; averageOrderValue: number };
  orders: { total: number; last30Days: number; byStatus: Record<string, number> };
  products: { total: number; outOfStock: number; lowStock: number; totalInventory: number };
  customers: { total: number; withOrders: number; newLast30Days: number };
  reviews: { total: number; averageRating: number };
  newsletter: { subscribers: number };
  messages: { total: number; unread: number };
}

export interface AdminCustomer {
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

export interface AdminReview {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  userId: string | null;
  authorName: string;
  authorEmail: string | null;
  rating: number;
  comment: string;
  verified: boolean;
  reported: boolean;
  status: "pending" | "approved" | "hidden";
  helpfulCount: number;
  createdAt: string;
}

export interface TopProduct {
  productId: string | null;
  title: string;
  slug: string | null;
  unitsSold: number;
  revenue: number;
}

export const adminRepository = {
  /** Aggregates for the dashboard, computed in one round trip. */
  async dashboardStats(): Promise<DashboardStats> {
    const row = await queryOne<{
      revenue_total: number | null;
      revenue_30: number | null;
      aov: number | null;
      orders_total: number;
      orders_30: number;
      products_total: number;
      out_of_stock: number;
      low_stock: number;
      inventory: number | null;
      customers_total: number;
      customers_with_orders: number;
      customers_30: number;
      reviews_total: number;
      reviews_avg: number | null;
      subscribers: number;
      messages_total: number;
      messages_unread: number;
    }>(`
      SELECT
        (SELECT COALESCE(sum(total), 0) FROM public.orders WHERE status <> 'cancelled') AS revenue_total,
        (SELECT COALESCE(sum(total), 0) FROM public.orders
          WHERE status <> 'cancelled' AND created_at >= now() - interval '30 days') AS revenue_30,
        (SELECT COALESCE(avg(total), 0) FROM public.orders WHERE status <> 'cancelled') AS aov,
        (SELECT count(*)::int FROM public.orders) AS orders_total,
        (SELECT count(*)::int FROM public.orders WHERE created_at >= now() - interval '30 days') AS orders_30,
        (SELECT count(*)::int FROM public.products) AS products_total,
        (SELECT count(*)::int FROM public.products WHERE stock = 0) AS out_of_stock,
        (SELECT count(*)::int FROM public.products WHERE stock > 0 AND stock <= 5) AS low_stock,
        (SELECT COALESCE(sum(stock), 0) FROM public.products) AS inventory,
        (SELECT count(*)::int FROM public.users WHERE role = 'customer') AS customers_total,
        (SELECT count(DISTINCT user_id)::int FROM public.orders) AS customers_with_orders,
        (SELECT count(*)::int FROM public.users
          WHERE role = 'customer' AND created_at >= now() - interval '30 days') AS customers_30,
        (SELECT count(*)::int FROM public.reviews) AS reviews_total,
        (SELECT avg(rating)::float FROM public.reviews) AS reviews_avg,
        (SELECT count(*)::int FROM public.newsletter_subscribers WHERE status = 'subscribed') AS subscribers,
        (SELECT count(*)::int FROM public.contact_messages) AS messages_total,
        (SELECT count(*)::int FROM public.contact_messages WHERE status = 'new') AS messages_unread
    `);

    const statusRows = await queryMany<{ status: string; count: number }>(
      "SELECT status, count(*)::int AS count FROM public.orders GROUP BY status",
    );
    const byStatus: Record<string, number> = {};
    for (const s of statusRows) byStatus[s.status] = s.count;

    return {
      revenue: {
        total: Number(row?.revenue_total ?? 0),
        last30Days: Number(row?.revenue_30 ?? 0),
        averageOrderValue: Number(row?.aov ?? 0),
      },
      orders: {
        total: row?.orders_total ?? 0,
        last30Days: row?.orders_30 ?? 0,
        byStatus,
      },
      products: {
        total: row?.products_total ?? 0,
        outOfStock: row?.out_of_stock ?? 0,
        lowStock: row?.low_stock ?? 0,
        totalInventory: Number(row?.inventory ?? 0),
      },
      customers: {
        total: row?.customers_total ?? 0,
        withOrders: row?.customers_with_orders ?? 0,
        newLast30Days: row?.customers_30 ?? 0,
      },
      reviews: {
        total: row?.reviews_total ?? 0,
        averageRating: Number(row?.reviews_avg ?? 0),
      },
      newsletter: { subscribers: row?.subscribers ?? 0 },
      messages: { total: row?.messages_total ?? 0, unread: row?.messages_unread ?? 0 },
    };
  },

  /** Best sellers by units, derived from real order lines. */
  async topProducts(limit: number): Promise<TopProduct[]> {
    const rows = await queryMany<{
      product_id: string | null;
      title: string;
      slug: string | null;
      units: number;
      revenue: number;
    }>(
      `SELECT oi.product_id,
              oi.product_title AS title,
              oi.product_slug  AS slug,
              sum(oi.quantity)::int AS units,
              sum(oi.total_price)   AS revenue
       FROM public.order_items oi
       JOIN public.orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
       GROUP BY oi.product_id, oi.product_title, oi.product_slug
       ORDER BY units DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      productId: r.product_id,
      title: r.title,
      slug: r.slug,
      unitsSold: r.units,
      revenue: Number(r.revenue),
    }));
  },

  /** Daily revenue for the analytics chart. */
  async revenueByDay(days: number): Promise<Array<{ date: string; revenue: number; orders: number }>> {
    const rows = await queryMany<{ day: Date; revenue: number; orders: number }>(
      `SELECT date_trunc('day', created_at) AS day,
              COALESCE(sum(total), 0) AS revenue,
              count(*)::int AS orders
       FROM public.orders
       WHERE status <> 'cancelled' AND created_at >= now() - ($1::int * interval '1 day')
       GROUP BY day
       ORDER BY day`,
      [days],
    );
    return rows.map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      revenue: Number(r.revenue),
      orders: r.orders,
    }));
  },

  /** Customers with derived order totals. */
  async customers(): Promise<AdminCustomer[]> {
    const rows = await queryMany<{
      id: string;
      name: string;
      email: string;
      role: string;
      created_at: Date;
      orders_count: number;
      total_spent: number;
      last_order_at: Date | null;
      wishlist_count: number;
    }>(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              (SELECT count(*)::int FROM public.orders o WHERE o.user_id = u.id) AS orders_count,
              (SELECT COALESCE(sum(o.total), 0) FROM public.orders o
                WHERE o.user_id = u.id AND o.status <> 'cancelled') AS total_spent,
              (SELECT max(o.created_at) FROM public.orders o WHERE o.user_id = u.id) AS last_order_at,
              (SELECT count(*)::int FROM public.wishlist_items w WHERE w.user_id = u.id) AS wishlist_count
       FROM public.users u
       ORDER BY total_spent DESC, u.created_at DESC`,
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      createdAt: new Date(r.created_at).toISOString(),
      ordersCount: r.orders_count,
      totalSpent: Number(r.total_spent),
      lastOrderAt: r.last_order_at ? new Date(r.last_order_at).toISOString() : null,
      wishlistCount: r.wishlist_count,
    }));
  },

  /** Every review with its product, for moderation. */
  async reviews(): Promise<AdminReview[]> {
    const rows = await queryMany<{
      id: string;
      product_id: string;
      product_title: string;
      product_slug: string;
      user_id: string | null;
      author_name: string;
      author_email: string | null;
      rating: number;
      comment: string;
      verified: boolean;
      reported: boolean;
      status: "pending" | "approved" | "hidden";
      helpful_count: number;
      created_at: Date;
    }>(
      `SELECT r.id, r.product_id, p.title AS product_title, p.slug AS product_slug,
              r.user_id, r.author_name, r.author_email, r.rating, r.comment,
              r.verified, r.reported, r.status, r.helpful_count, r.created_at
       FROM public.reviews r
       JOIN public.products p ON p.id = r.product_id
       ORDER BY r.created_at DESC`,
    );

    return rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      productTitle: r.product_title,
      productSlug: r.product_slug,
      userId: r.user_id,
      authorName: r.author_name,
      authorEmail: r.author_email,
      rating: r.rating,
      comment: r.comment,
      verified: r.verified,
      reported: r.reported,
      status: r.status,
      helpfulCount: r.helpful_count,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  },

  /**
   * Operational notifications derived from real data rather than stored as
   * their own records: recent orders, low stock, unread contact messages and
   * recent reviews. Deriving keeps them always accurate and avoids a table
   * that could drift from the facts it describes.
   */
  async notifications(): Promise<
    Array<{ id: string; type: string; title: string; body: string; createdAt: string }>
  > {
    const [orders, lowStock, messages, reviews] = await Promise.all([
      queryMany<{ id: string; order_number: string; customer_name: string; total: number; created_at: Date }>(
        `SELECT id, order_number, customer_name, total, created_at
         FROM public.orders ORDER BY created_at DESC LIMIT 10`,
      ),
      queryMany<{ id: string; title: string; stock: number; updated_at: Date }>(
        `SELECT id, title, stock, updated_at FROM public.products
         WHERE stock <= 5 ORDER BY stock ASC LIMIT 10`,
      ),
      queryMany<{ id: string; name: string; subject: string | null; created_at: Date }>(
        `SELECT id, name, subject, created_at FROM public.contact_messages
         WHERE status = 'new' ORDER BY created_at DESC LIMIT 10`,
      ),
      queryMany<{ id: string; author_name: string; rating: number; title: string; created_at: Date }>(
        `SELECT r.id, r.author_name, r.rating, p.title, r.created_at
         FROM public.reviews r JOIN public.products p ON p.id = r.product_id
         ORDER BY r.created_at DESC LIMIT 10`,
      ),
    ]);

    const rows = [
      ...orders.map((o) => ({
        id: `order-${o.id}`,
        type: "order",
        title: `New order ${o.order_number}`,
        body: `${o.customer_name} · $${Number(o.total).toFixed(2)}`,
        createdAt: new Date(o.created_at).toISOString(),
      })),
      ...lowStock.map((p) => ({
        id: `stock-${p.id}`,
        type: "stock",
        title: p.stock === 0 ? `${p.title} is out of stock` : `${p.title} is low on stock`,
        body: `${p.stock} remaining`,
        createdAt: new Date(p.updated_at).toISOString(),
      })),
      ...messages.map((m) => ({
        id: `message-${m.id}`,
        type: "message",
        title: `Message from ${m.name}`,
        body: m.subject ?? "New contact form submission",
        createdAt: new Date(m.created_at).toISOString(),
      })),
      ...reviews.map((r) => ({
        id: `review-${r.id}`,
        type: "review",
        title: `${r.rating}★ review on ${r.title}`,
        body: `by ${r.author_name}`,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    ];

    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
  },

  async updateReview(
    id: string,
    patch: {
      rating?: number | undefined;
      comment?: string | undefined;
      reported?: boolean | undefined;
      status?: "pending" | "approved" | "hidden" | undefined;
    },
  ): Promise<boolean> {
    const assignments: string[] = [];
    const params: unknown[] = [];
    if (patch.rating !== undefined) {
      params.push(patch.rating);
      assignments.push(`rating = $${params.length}`);
    }
    if (patch.comment !== undefined) {
      params.push(patch.comment);
      assignments.push(`comment = $${params.length}`);
    }
    if (patch.reported !== undefined) {
      params.push(patch.reported);
      assignments.push(`reported = $${params.length}`);
    }
    if (patch.status !== undefined) {
      params.push(patch.status);
      assignments.push(`status = $${params.length}`);
    }
    if (assignments.length === 0) return true;

    params.push(id);
    const row = await queryOne<{ id: string }>(
      `UPDATE public.reviews SET ${assignments.join(", ")} WHERE id = $${params.length} RETURNING id`,
      params,
    );
    return row !== null;
  },

  async deleteReview(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "DELETE FROM public.reviews WHERE id = $1 RETURNING id",
      [id],
    );
    return row !== null;
  },
};
