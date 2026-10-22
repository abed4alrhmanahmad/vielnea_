/**
 * Customer-facing availability. Mirrors the server's rule (cart.service
 * `availableStock`): a size is purchasable when both its own stock and the
 * product's total stock are above zero. Only booleans leave this module —
 * exact quantities are never shown to customers; the server enforces them.
 */
type StockInfo = {
  stock: number;
  sizes: string[];
  /** Per-size stock from the API; absent on the static catalogue type. */
  sizeStock?: Record<string, number>;
};

export function isSizeAvailable(product: StockInfo, size: string): boolean {
  if (product.stock <= 0) return false;
  const sizeStock = product.sizeStock?.[size];
  return sizeStock === undefined ? true : sizeStock > 0;
}

/** True when nothing can be bought: the product itself, or every one of its sizes. */
export function isSoldOut(product: StockInfo): boolean {
  if (product.stock <= 0) return true;
  if (product.sizes.length === 0) return false;
  return product.sizes.every((s) => !isSizeAvailable(product, s));
}
