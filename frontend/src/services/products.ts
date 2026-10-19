import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient, type PaginationMeta } from "@/lib/api/client";
import { toStoreProduct, toStoreProducts, type StoreProduct } from "@/lib/api/mappers";
import type { ApiProduct, ProductListParams } from "@/lib/api/types";

export interface ProductListResult {
  products: StoreProduct[];
  pagination: PaginationMeta;
}

const EMPTY_PAGINATION: PaginationMeta = {
  total: 0,
  page: 1,
  limit: 12,
  totalPages: 1,
  hasPrevPage: false,
  hasNextPage: false,
};

export const productKeys = {
  all: ["products"] as const,
  list: (params: ProductListParams) => ["products", "list", params] as const,
  detail: (slug: string) => ["products", "detail", slug] as const,
  related: (slug: string) => ["products", "related", slug] as const,
};

export async function fetchProducts(params: ProductListParams): Promise<ProductListResult> {
  const { data, pagination } = await apiClient.full<ApiProduct[]>("/products", {
    params: {
      search: params.search,
      category: params.category,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      sort: params.sort,
      page: params.page,
      limit: params.limit,
      gift: params.gift,
      newArrival: params.newArrival,
      bestSeller: params.bestSeller,
      featured: params.featured,
      inStock: params.inStock,
    },
  });

  return { products: toStoreProducts(data), pagination: pagination ?? EMPTY_PAGINATION };
}

export async function fetchProductBySlug(slug: string): Promise<StoreProduct> {
  return toStoreProduct(
    await apiClient.get<ApiProduct>(`/products/slug/${encodeURIComponent(slug)}`),
  );
}

export async function fetchRelatedProducts(slug: string, limit = 4): Promise<StoreProduct[]> {
  const data = await apiClient.get<ApiProduct[]>(`/products/${encodeURIComponent(slug)}/related`, {
    params: { limit },
  });
  return toStoreProducts(data);
}

/** Shared between route loaders (prefetch) and components (useQuery). */
export function productDetailOptions(slug: string) {
  return queryOptions({
    queryKey: productKeys.detail(slug),
    queryFn: () => fetchProductBySlug(slug),
    staleTime: 60_000,
  });
}

/** Shared by the hook and by route loaders that prefetch for SSR. */
export function productListOptions(params: ProductListParams) {
  return queryOptions({
    queryKey: productKeys.list(params),
    queryFn: () => fetchProducts(params),
    staleTime: 30_000,
  });
}

export function useProducts(params: ProductListParams) {
  return useQuery(productListOptions(params));
}

export function useProduct(slug: string) {
  return useQuery(productDetailOptions(slug));
}

export function useRelatedProducts(slug: string, limit = 4) {
  return useQuery({
    queryKey: productKeys.related(slug),
    queryFn: () => fetchRelatedProducts(slug, limit),
    staleTime: 60_000,
    enabled: Boolean(slug),
  });
}
