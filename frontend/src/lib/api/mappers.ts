import type { Category, Product } from "@/data/products";
import type { ApiProduct } from "./types";

/**
 * Adapts an API product onto the `Product` shape the storefront components
 * already consume, so no presentational component needed rewriting.
 *
 * `id` is deliberately the slug: existing routes are /product/$id with the slug
 * as the parameter, and the API resolves either a slug or a UUID. `uuid` carries
 * the real primary key for callers that need it.
 */
export interface StoreProduct extends Product {
  uuid: string;
  slug: string;
  finalPrice: number;
  categoryLabel: string;
  sizeStock: Record<string, number>;
  /** Admin-set homepage feature flag, used by CMS product rows. */
  isFeatured: boolean;
}

export function toStoreProduct(api: ApiProduct): StoreProduct {
  const sizeStock: Record<string, number> = {};
  for (const entry of api.sizeDetails) sizeStock[entry.size] = entry.stock;

  return {
    id: api.slug,
    uuid: api.id,
    slug: api.slug,
    title: api.title,
    description: api.description,
    category: api.category as Category,
    categoryLabel: api.categoryLabel,
    price: api.price,
    discount: api.discount,
    finalPrice: api.finalPrice,
    stock: api.stock,
    rating: api.rating,
    reviewCount: api.reviewCount,
    images: api.images,
    sizes: api.sizes,
    sizeStock,
    measurements: api.measurements,
    model: {
      height: api.modelHeight ?? "",
      weight: api.modelWeight ?? "",
      wearingSize: api.wearingSize ?? "",
    },
    isNew: api.isNewArrival,
    isBestSeller: api.isBestSeller,
    hasGift: api.hasGift,
    isFeatured: api.isFeatured,
  };
}

export function toStoreProducts(items: ApiProduct[]): StoreProduct[] {
  return items.map(toStoreProduct);
}
