import { pool, withTransaction } from "../lib/db.js";
import { productRepository, type ProductListResult } from "../repositories/product.repository.js";
import { categoryRepository } from "../repositories/category.repository.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import { slugify, randomSlugSuffix } from "../utils/slug.js";
import { cached, invalidateCache } from "../lib/cache.js";

// The homepage and shop page both load this on every visit, and the
// database is remote, so every uncached hit pays real round-trip network
// latency (~255ms per query, measured). Freshness comes from
// invalidateProductsCache() on every write, not from the TTL, so the TTL is
// only a safety net and can be long: at 20s a visitor arriving more than 20s
// after the last one paid the full round trip, which on a low-traffic store
// was almost every visitor.
const LIST_CACHE_TTL_MS = 5 * 60_000;

/**
 * Drops every cached product listing.
 *
 * Called by this service's own writes and by the review paths: a review
 * insert/delete/moderation fires the 0008 database trigger that recomputes
 * products.rating and products.review_count, and listings select both, so a
 * rating change has to clear these entries too.
 */
export function invalidateProductsCache(): void {
  invalidateCache("products:list:");
}
import type { Product } from "../types/models.js";
import type { ProductQuery } from "../schemas/index.js";
import type { z } from "zod";
import type { createProductSchema, updateProductSchema } from "../schemas/index.js";

type CreateInput = z.infer<typeof createProductSchema>;
type UpdateInput = z.infer<typeof updateProductSchema>;

/** Parses "96 cm" -> 96. Returns null for non-numeric values. */
function parseMeasure(value: string | undefined): number | null {
  if (!value) return null;
  const match = /-?\d+(\.\d+)?/.exec(value);
  return match ? Number.parseFloat(match[0]) : null;
}

export const productService = {
  async list(query: ProductQuery): Promise<ProductListResult> {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestError("minPrice cannot be greater than maxPrice");
    }
    // Keyed on the exact query shape, so distinct filters/sorts/pages each
    // get their own cache slot instead of colliding.
    const key = `products:list:${JSON.stringify(query)}`;
    return cached(key, LIST_CACHE_TTL_MS, () => productRepository.findMany(query));
  },

  async getByIdOrSlug(idOrSlug: string): Promise<Product> {
    const product = await productRepository.findByIdOrSlug(idOrSlug);
    if (!product) throw new NotFoundError("Product not found");
    return product;
  },

  async getBySlug(slug: string): Promise<Product> {
    const product = await productRepository.findBySlug(slug);
    if (!product) throw new NotFoundError("Product not found");
    return product;
  },

  async related(idOrSlug: string, limit = 4): Promise<Product[]> {
    const product = await this.getByIdOrSlug(idOrSlug);
    // No category to match against — "" is not a real category_id (a uuid
    // column), so short-circuit rather than send it into the query.
    if (!product.categoryId) return [];
    return productRepository.findRelated(product.id, product.categoryId, limit);
  },

  async create(input: CreateInput): Promise<Product> {
    // Category is optional: only resolve/validate one when the admin
    // actually picked one. Otherwise the product is created uncategorised
    // (category_id null) rather than guessing.
    let categoryId: string | null = null;
    if (input.category !== undefined) {
      categoryId = await categoryRepository.resolveId(input.category);
      if (!categoryId) throw new BadRequestError(`Unknown category: ${input.category}`);
    }

    // Title is optional too, so it may not yield a usable slug. The slug is
    // a technical identifier, not the title — falling back to a short random
    // one lets the product save without inventing a display title.
    const derivedSlug = input.title ? slugify(input.title) : "";
    const slug = input.slug ?? (derivedSlug || `product-${randomSlugSuffix()}`);
    if (await productRepository.existsBySlug(slug)) {
      throw new ConflictError(`A product with the slug "${slug}" already exists`);
    }

    const id = await withTransaction(async (client) => {
      // rating and review_count are omitted on purpose: migration 0008 makes
      // them derived from public.reviews, so a new product starts with no
      // rating and earns one from real reviews. Accepting them here would let
      // an admin publish a star rating no customer ever gave.
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.products
           (slug, title, description, category_id, price, discount, stock,
            is_featured, is_best_seller, is_new_arrival, has_gift,
            model_height, model_weight, wearing_size)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          slug,
          // title/price fall back to the same safe defaults their columns
          // already carry (`''` / `0`) — this only makes explicit, for a
          // fixed parameterised insert, what an omitted column would do.
          input.title ?? "",
          input.description,
          categoryId,
          input.price ?? 0,
          input.discount,
          input.stock,
          input.isFeatured,
          input.isBestSeller,
          input.isNewArrival,
          input.hasGift,
          input.modelHeight ?? null,
          input.modelWeight ?? null,
          input.wearingSize ?? null,
        ],
      );
      const productId = result.rows[0]?.id;
      if (!productId) throw new Error("Insert returned no id");

      for (const [index, image] of input.images.entries()) {
        await client.query(
          `INSERT INTO public.product_images (product_id, image_url, alt_text, sort_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, image_url) DO NOTHING`,
          [productId, image.imageUrl, image.altText ?? input.title ?? null, index],
        );
      }

      for (const [index, size] of input.sizes.entries()) {
        await client.query(
          `INSERT INTO public.product_sizes (product_id, size, stock, sort_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, size) DO UPDATE SET stock = EXCLUDED.stock`,
          [productId, size.size, size.stock, index],
        );
      }

      for (const measurement of input.measurements) {
        await client.query(
          `INSERT INTO public.product_measurements
             (product_id, size, bust, waist, hips, length, labels)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (product_id, size) DO UPDATE
             SET bust = EXCLUDED.bust, waist = EXCLUDED.waist,
                 hips = EXCLUDED.hips, length = EXCLUDED.length,
                 labels = EXCLUDED.labels`,
          [
            productId,
            measurement.size,
            measurement.bust ?? parseMeasure(measurement.labels["Bust"]),
            measurement.waist ?? parseMeasure(measurement.labels["Waist"]),
            measurement.hips ?? parseMeasure(measurement.labels["Hip"] ?? measurement.labels["Hips"]),
            measurement.length ?? parseMeasure(measurement.labels["Length"]),
            JSON.stringify(measurement.labels),
          ],
        );
      }

      return productId;
    });

    invalidateProductsCache();
    return this.getByIdOrSlug(id);
  },

  async update(idOrSlug: string, input: UpdateInput): Promise<Product> {
    const existing = await this.getByIdOrSlug(idOrSlug);

    const columnMap: Record<string, string> = {
      title: "title",
      description: "description",
      price: "price",
      discount: "discount",
      stock: "stock",
      // rating / review_count are intentionally absent — they are derived from
      // public.reviews by the trigger in migration 0008. An edit here would be
      // overwritten by the next review anyway, and in the meantime it would
      // show shoppers a rating nobody gave.
      isFeatured: "is_featured",
      isBestSeller: "is_best_seller",
      isNewArrival: "is_new_arrival",
      hasGift: "has_gift",
      modelHeight: "model_height",
      modelWeight: "model_weight",
      wearingSize: "wearing_size",
      slug: "slug",
    };

    const assignments: string[] = [];
    const params: unknown[] = [];

    for (const [key, column] of Object.entries(columnMap)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) {
        params.push(value);
        assignments.push(`${column} = $${params.length}`);
      }
    }

    if (input.category !== undefined) {
      const categoryId = await categoryRepository.resolveId(input.category);
      if (!categoryId) throw new BadRequestError(`Unknown category: ${input.category}`);
      params.push(categoryId);
      assignments.push(`category_id = $${params.length}`);
    }

    if (assignments.length > 0) {
      params.push(existing.id);
      await pool.query(
        `UPDATE public.products SET ${assignments.join(", ")} WHERE id = $${params.length}`,
        params,
      );
    }

    // Child collections are replaced wholesale only when explicitly provided.
    if (input.images) {
      await withTransaction(async (client) => {
        await client.query("DELETE FROM public.product_images WHERE product_id = $1", [existing.id]);
        for (const [index, image] of input.images!.entries()) {
          await client.query(
            `INSERT INTO public.product_images (product_id, image_url, alt_text, sort_order)
             VALUES ($1, $2, $3, $4) ON CONFLICT (product_id, image_url) DO NOTHING`,
            [existing.id, image.imageUrl, image.altText ?? existing.title, index],
          );
        }
      });
    }

    if (input.sizes) {
      await withTransaction(async (client) => {
        await client.query("DELETE FROM public.product_sizes WHERE product_id = $1", [existing.id]);
        for (const [index, size] of input.sizes!.entries()) {
          await client.query(
            `INSERT INTO public.product_sizes (product_id, size, stock, sort_order)
             VALUES ($1, $2, $3, $4)`,
            [existing.id, size.size, size.stock, index],
          );
        }
      });
    }

    invalidateProductsCache();
    return this.getByIdOrSlug(existing.id);
  },

  async remove(idOrSlug: string): Promise<void> {
    const product = await this.getByIdOrSlug(idOrSlug);
    const deleted = await productRepository.deleteById(product.id);
    if (!deleted) throw new NotFoundError("Product not found");
    invalidateProductsCache();
  },
};
