/**
 * Stock rules shared by every admin screen that reports or edits stock.
 *
 * Kept free of React and of "@/" imports so it can be unit-tested directly.
 *
 * The definition matches the server's own figures (admin.repository.ts):
 * `out` is exactly 0, `low` is 1–5. Dashboard, Analytics, Inventory and the
 * notifications all read it from here instead of each re-deriving it — they
 * used to disagree on whether a sold-out product counted as "low".
 */
export const LOW_STOCK_THRESHOLD = 5;

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

/** 1–5 units left. A sold-out product is `out`, not `low`. */
export function isLowStock(stock: number): boolean {
  return stockLevel(stock) === "low";
}

export function isOutOfStock(stock: number): boolean {
  return stockLevel(stock) === "out";
}

/** Low or out: the products someone should restock. */
export function needsRestock(stock: number): boolean {
  return stockLevel(stock) !== "ok";
}

/**
 * The size/stock part of a product *edit*. Stock is managed in Inventory, so
 * the general edit form never sends stock it read when it was opened — that
 * snapshot silently reverted any Inventory change made in the meantime.
 *
 * - Same size list as before: returns null, so no size or stock is sent and
 *   the stored figures stay exactly as they are.
 * - Different size list: the sizes have to be rewritten (the API replaces
 *   them as a set), so each size keeps its *current* stock — read fresh from
 *   the server, not from the form — and a newly added size starts at 0.
 *   An emptied list sends no stock: the product keeps its stored total.
 */
export function sizeChangePayload(
  previousSizes: readonly string[],
  nextSizes: readonly string[],
  currentSizeStock: Readonly<Record<string, number>>,
): { sizes: string[]; sizeStock: Record<string, number>; stock?: number } | null {
  const same =
    previousSizes.length === nextSizes.length && previousSizes.every((s, i) => s === nextSizes[i]);
  if (same) return null;
  const sizeStock = Object.fromEntries(nextSizes.map((s) => [s, currentSizeStock[s] ?? 0]));
  if (nextSizes.length === 0) return { sizes: [], sizeStock };
  const stock = Object.values(sizeStock).reduce((sum, n) => sum + n, 0);
  return { sizes: [...nextSizes], sizeStock, stock };
}
