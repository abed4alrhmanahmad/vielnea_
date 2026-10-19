import { wishlistRepository } from "../repositories/wishlist.repository.js";
import { productRepository } from "../repositories/product.repository.js";
import { cartService } from "./cart.service.js";
import { NotFoundError } from "../lib/errors.js";
import type { CartSummary, WishlistItem } from "../types/models.js";

export const wishlistService = {
  async get(userId: string): Promise<WishlistItem[]> {
    const rows = await wishlistRepository.findByUser(userId);
    const products = await productRepository.findByIds(rows.map((r) => r.product_id));

    return rows.flatMap((row) => {
      const product = products.get(row.product_id);
      if (!product) return [];
      return [
        {
          id: row.id,
          productId: product.id,
          slug: product.slug,
          addedAt: new Date(row.created_at).toISOString(),
          product,
        },
      ];
    });
  },

  async add(userId: string, productIdOrSlug: string): Promise<WishlistItem[]> {
    const productId = await productRepository.resolveId(productIdOrSlug);
    if (!productId) throw new NotFoundError("Product not found");

    await wishlistRepository.add(userId, productId);
    return this.get(userId);
  },

  async remove(userId: string, productIdOrSlug: string): Promise<WishlistItem[]> {
    const productId = await productRepository.resolveId(productIdOrSlug);
    if (!productId) throw new NotFoundError("Product not found");

    await wishlistRepository.remove(userId, productId);
    return this.get(userId);
  },

  /** Toggle keeps the storefront's heart button to a single request. */
  async toggle(
    userId: string,
    productIdOrSlug: string,
  ): Promise<{ wishlisted: boolean; items: WishlistItem[] }> {
    const productId = await productRepository.resolveId(productIdOrSlug);
    if (!productId) throw new NotFoundError("Product not found");

    const exists = await wishlistRepository.exists(userId, productId);
    if (exists) {
      await wishlistRepository.remove(userId, productId);
    } else {
      await wishlistRepository.add(userId, productId);
    }

    return { wishlisted: !exists, items: await this.get(userId) };
  },

  /** Adopts a guest's local wishlist on sign-in; unknown ids are skipped. */
  async merge(userId: string, productIdsOrSlugs: readonly string[]): Promise<WishlistItem[]> {
    const resolved: string[] = [];
    for (const idOrSlug of productIdsOrSlugs) {
      const productId = await productRepository.resolveId(idOrSlug);
      if (productId) resolved.push(productId);
    }
    await wishlistRepository.mergeMany(userId, resolved);
    return this.get(userId);
  },

  /**
   * Moves an item into the cart and off the wishlist. Defaults to the product's
   * first available size when the caller does not choose one.
   */
  async moveToCart(
    userId: string,
    productIdOrSlug: string,
    size: string | undefined,
    quantity: number,
  ): Promise<{ cart: CartSummary; items: WishlistItem[] }> {
    const product = await productRepository.findByIdOrSlug(productIdOrSlug);
    if (!product) throw new NotFoundError("Product not found");

    const chosenSize = size ?? product.sizes[0] ?? "One Size";
    const cart = await cartService.add(userId, {
      productId: product.id,
      size: chosenSize,
      quantity,
    });

    await wishlistRepository.remove(userId, product.id);
    return { cart, items: await this.get(userId) };
  },
};
