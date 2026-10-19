import { cartRepository } from "../repositories/cart.repository.js";
import { cmsRepository } from "../repositories/cms.repository.js";
import { productRepository } from "../repositories/product.repository.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { toMoney } from "../utils/slug.js";
import type { CartItem, CartSummary, Product } from "../types/models.js";

/**
 * The shipping rate comes from store_settings so an admin can change it without
 * a deploy. The value is cached briefly because checkout reads it on a hot
 * path; the cache is short enough that an admin edit takes effect promptly.
 */
const SETTINGS_TTL_MS = 30_000;
let shippingCache: { flatRate: number; readAt: number } | null = null;

export async function shippingRules(): Promise<{ flatRate: number }> {
  if (shippingCache && Date.now() - shippingCache.readAt < SETTINGS_TTL_MS) {
    return { flatRate: shippingCache.flatRate };
  }
  const settings = await cmsRepository.storeSettings();
  shippingCache = {
    flatRate: settings.standardShipping,
    readAt: Date.now(),
  };
  return { flatRate: shippingCache.flatRate };
}

/** Clears the cache so an admin settings change is reflected immediately. */
export function invalidateShippingCache(): void {
  shippingCache = null;
}

export async function shippingFor(subtotal: number): Promise<number> {
  if (subtotal <= 0) return 0;
  const { flatRate } = await shippingRules();
  return flatRate;
}

/**
 * Available units for a product/size. Falls back to the product-level stock
 * when the product has no per-size rows (accessories, "One Size").
 */
export async function availableStock(product: Product, size: string): Promise<number> {
  if (product.sizeDetails.length === 0) return product.stock;
  const match = product.sizeDetails.find((s) => s.size === size);
  if (!match) return 0;
  return Math.min(match.stock, product.stock);
}

/** Prices always come from the database, never from the request body. */
async function buildSummary(
  rows: ReadonlyArray<{ id: string; product_id: string; size: string; quantity: number }>,
  products: Map<string, Product>,
): Promise<CartSummary> {
  const items: CartItem[] = [];
  let subtotal = 0;
  let discount = 0;

  for (const row of rows) {
    const product = products.get(row.product_id);
    if (!product) continue; // product deleted after being added to the cart

    const unitPrice = product.finalPrice;
    const lineTotal = toMoney(unitPrice * row.quantity);
    subtotal += lineTotal;
    discount += toMoney((product.price - unitPrice) * row.quantity);

    items.push({
      id: row.id,
      productId: product.id,
      slug: product.slug,
      size: row.size,
      quantity: row.quantity,
      unitPrice,
      lineTotal,
      product,
    });
  }

  subtotal = toMoney(subtotal);
  const shipping = await shippingFor(subtotal);

  return {
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotal,
    discount: toMoney(discount),
    total: toMoney(subtotal + shipping),
  };
}

async function loadCart(userId: string): Promise<CartSummary> {
  const rows = await cartRepository.findByUser(userId);
  const products = await productRepository.findByIds(rows.map((r) => r.product_id));
  return buildSummary(rows, products);
}

export const cartService = {
  get: loadCart,

  async add(
    userId: string,
    input: { productId: string; size: string; quantity: number },
  ): Promise<CartSummary> {
    const product = await productRepository.findByIdOrSlug(input.productId);
    if (!product) throw new NotFoundError("Product not found");

    // An unknown size would otherwise be silently accepted and fail at checkout.
    if (product.sizes.length > 0 && !product.sizes.includes(input.size)) {
      throw new BadRequestError(
        `"${input.size}" is not an available size for ${product.title}`,
      );
    }

    const stock = await availableStock(product, input.size);
    if (stock <= 0) {
      throw new BadRequestError(`${product.title} (${input.size}) is out of stock`);
    }

    const existing = await cartRepository.findItem(userId, product.id, input.size);
    const alreadyInCart = existing?.quantity ?? 0;
    if (alreadyInCart >= stock) {
      throw new BadRequestError(
        `Only ${stock} left in size ${input.size} — you already have ${alreadyInCart} in your bag`,
      );
    }

    await cartRepository.upsertAdd(userId, product.id, input.size, input.quantity, stock);
    return loadCart(userId);
  },

  async updateQuantity(
    userId: string,
    productIdOrSlug: string,
    input: { size: string; quantity: number },
  ): Promise<CartSummary> {
    const product = await productRepository.findByIdOrSlug(productIdOrSlug);
    if (!product) throw new NotFoundError("Product not found");

    // Quantity 0 is the natural "remove" signal from a quantity stepper.
    if (input.quantity === 0) {
      await cartRepository.removeItem(userId, product.id, input.size);
      return loadCart(userId);
    }

    const stock = await availableStock(product, input.size);
    if (input.quantity > stock) {
      throw new BadRequestError(
        `Only ${stock} left in size ${input.size} for ${product.title}`,
      );
    }

    const updated = await cartRepository.setQuantity(
      userId,
      product.id,
      input.size,
      input.quantity,
    );
    if (!updated) throw new NotFoundError("That item is not in your bag");

    return loadCart(userId);
  },

  async remove(userId: string, productIdOrSlug: string, size?: string): Promise<CartSummary> {
    const productId = await productRepository.resolveId(productIdOrSlug);
    if (!productId) throw new NotFoundError("Product not found");

    const removed = await cartRepository.removeItem(userId, productId, size);
    if (removed === 0) throw new NotFoundError("That item is not in your bag");

    return loadCart(userId);
  },

  async clear(userId: string): Promise<CartSummary> {
    await cartRepository.clear(userId);
    return loadCart(userId);
  },

  /**
   * Adopts a guest's local cart on sign-in. Unknown products, invalid sizes and
   * out-of-stock lines are skipped rather than failing the whole merge, so a
   * stale localStorage cart can never block a login.
   */
  async merge(
    userId: string,
    items: ReadonlyArray<{ productId: string; size: string; quantity: number }>,
  ): Promise<CartSummary> {
    const resolved: Array<{ productId: string; size: string; quantity: number }> = [];

    for (const item of items) {
      const product = await productRepository.findByIdOrSlug(item.productId);
      if (!product) continue;

      const size =
        product.sizes.length === 0 || product.sizes.includes(item.size)
          ? item.size
          : (product.sizes[0] ?? item.size);

      const stock = await availableStock(product, size);
      if (stock <= 0) continue;

      resolved.push({
        productId: product.id,
        size,
        quantity: Math.min(item.quantity, stock),
      });
    }

    await cartRepository.mergeMany(userId, resolved);
    return loadCart(userId);
  },

  buildSummary,
};
