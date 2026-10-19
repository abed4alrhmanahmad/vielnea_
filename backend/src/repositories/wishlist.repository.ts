import { pool, queryMany, queryOne } from "../lib/db.js";

export interface WishlistRow {
  id: string;
  product_id: string;
  created_at: Date;
}

export const wishlistRepository = {
  async findByUser(userId: string): Promise<WishlistRow[]> {
    return queryMany<WishlistRow>(
      `SELECT id, product_id, created_at
       FROM public.wishlist_items
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
  },

  /** Idempotent: adding an existing entry returns the existing row. */
  async add(userId: string, productId: string): Promise<WishlistRow> {
    const row = await queryOne<WishlistRow>(
      `INSERT INTO public.wishlist_items (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO UPDATE SET created_at = public.wishlist_items.created_at
       RETURNING id, product_id, created_at`,
      [userId, productId],
    );
    if (!row) throw new Error("Failed to add wishlist item");
    return row;
  },

  async remove(userId: string, productId: string): Promise<boolean> {
    const result = await pool.query(
      "DELETE FROM public.wishlist_items WHERE user_id = $1 AND product_id = $2",
      [userId, productId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async exists(userId: string, productId: string): Promise<boolean> {
    const row = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM public.wishlist_items WHERE user_id = $1 AND product_id = $2
       ) AS exists`,
      [userId, productId],
    );
    return row?.exists ?? false;
  },

  async mergeMany(userId: string, productIds: readonly string[]): Promise<void> {
    if (productIds.length === 0) return;
    await pool.query(
      `INSERT INTO public.wishlist_items (user_id, product_id)
       SELECT $1, unnest($2::uuid[])
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [userId, productIds],
    );
  },
};
