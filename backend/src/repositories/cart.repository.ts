import type { PoolClient } from "pg";
import { pool, queryMany, queryOne } from "../lib/db.js";

export interface CartRow {
  id: string;
  product_id: string;
  size: string;
  quantity: number;
  created_at: Date;
}

export const cartRepository = {
  async findByUser(userId: string, client?: PoolClient): Promise<CartRow[]> {
    const runner = client ?? pool;
    const result = await runner.query<CartRow>(
      `SELECT id, product_id, size, quantity, created_at
       FROM public.cart_items
       WHERE user_id = $1
       ORDER BY created_at`,
      [userId],
    );
    return result.rows;
  },

  async findItem(
    userId: string,
    productId: string,
    size: string,
  ): Promise<CartRow | null> {
    return queryOne<CartRow>(
      `SELECT id, product_id, size, quantity, created_at
       FROM public.cart_items
       WHERE user_id = $1 AND product_id = $2 AND size = $3
       LIMIT 1`,
      [userId, productId, size],
    );
  },

  /**
   * Adds to the cart, accumulating quantity when the same product/size is
   * already present. `maxQuantity` caps the result at available stock.
   */
  async upsertAdd(
    userId: string,
    productId: string,
    size: string,
    quantity: number,
    maxQuantity: number,
  ): Promise<CartRow> {
    const row = await queryOne<CartRow>(
      `INSERT INTO public.cart_items (user_id, product_id, size, quantity)
       VALUES ($1, $2, $3, LEAST($4::int, $5::int))
       ON CONFLICT (user_id, product_id, size)
       DO UPDATE SET quantity = LEAST(public.cart_items.quantity + $4::int, $5::int)
       RETURNING id, product_id, size, quantity, created_at`,
      [userId, productId, size, quantity, maxQuantity],
    );
    if (!row) throw new Error("Failed to add cart item");
    return row;
  },

  async setQuantity(
    userId: string,
    productId: string,
    size: string,
    quantity: number,
  ): Promise<CartRow | null> {
    return queryOne<CartRow>(
      `UPDATE public.cart_items SET quantity = $4
       WHERE user_id = $1 AND product_id = $2 AND size = $3
       RETURNING id, product_id, size, quantity, created_at`,
      [userId, productId, size, quantity],
    );
  },

  /** Removes one line, or every size of the product when `size` is omitted. */
  async removeItem(userId: string, productId: string, size?: string): Promise<number> {
    const result = size
      ? await pool.query(
          "DELETE FROM public.cart_items WHERE user_id = $1 AND product_id = $2 AND size = $3",
          [userId, productId, size],
        )
      : await pool.query("DELETE FROM public.cart_items WHERE user_id = $1 AND product_id = $2", [
          userId,
          productId,
        ]);
    return result.rowCount ?? 0;
  },

  async clear(userId: string, client?: PoolClient): Promise<number> {
    const runner = client ?? pool;
    const result = await runner.query("DELETE FROM public.cart_items WHERE user_id = $1", [userId]);
    return result.rowCount ?? 0;
  },

  async countItems(userId: string): Promise<number> {
    const row = await queryOne<{ total: number }>(
      "SELECT COALESCE(sum(quantity), 0)::int AS total FROM public.cart_items WHERE user_id = $1",
      [userId],
    );
    return row?.total ?? 0;
  },

  /** Bulk merge used when a guest signs in and their local cart is adopted. */
  async mergeMany(
    userId: string,
    items: ReadonlyArray<{ productId: string; size: string; quantity: number }>,
  ): Promise<void> {
    if (items.length === 0) return;
    await Promise.all(
      items.map((item) =>
        queryMany(
          `INSERT INTO public.cart_items (user_id, product_id, size, quantity)
           VALUES ($1, $2, $3, LEAST($4::int, 99))
           ON CONFLICT (user_id, product_id, size)
           DO UPDATE SET quantity = LEAST(public.cart_items.quantity + $4::int, 99)`,
          [userId, item.productId, item.size, item.quantity],
        ),
      ),
    );
  },
};
