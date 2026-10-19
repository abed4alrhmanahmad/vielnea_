/**
 * Storefront accessories, served from Supabase through the Express API.
 *
 * Accessories are their own entity — complementary / gift items, not clothing
 * products — so they have their own endpoint and their own query keys, and
 * they never pass through the product list or its category filter.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient, type PaginationMeta } from "@/lib/api/client";
import type { AccessoryListParams, ApiAccessory } from "@/lib/api/types";

export interface AccessoryListResult {
  accessories: ApiAccessory[];
  pagination: PaginationMeta;
}

const EMPTY_PAGINATION: PaginationMeta = {
  total: 0,
  page: 1,
  limit: 24,
  totalPages: 1,
  hasPrevPage: false,
  hasNextPage: false,
};

export const accessoryKeys = {
  all: ["accessories"] as const,
  list: (params: AccessoryListParams) => ["accessories", "list", params] as const,
  detail: (idOrSlug: string) => ["accessories", "detail", idOrSlug] as const,
};

export async function fetchAccessories(
  params: AccessoryListParams = {},
): Promise<AccessoryListResult> {
  const { data, pagination } = await apiClient.full<ApiAccessory[]>("/accessories", {
    params: {
      search: params.search,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      sort: params.sort,
      page: params.page,
      limit: params.limit,
      featured: params.featured,
      inStock: params.inStock,
      availability: params.availability,
    },
  });
  return { accessories: data, pagination: pagination ?? EMPTY_PAGINATION };
}

export async function fetchAccessory(idOrSlug: string): Promise<ApiAccessory> {
  return apiClient.get<ApiAccessory>(`/accessories/${encodeURIComponent(idOrSlug)}`);
}

/** Shared by the hook and by route loaders that prefetch for SSR. */
export function accessoryListOptions(params: AccessoryListParams = {}) {
  return queryOptions({
    queryKey: accessoryKeys.list(params),
    queryFn: () => fetchAccessories(params),
    staleTime: 30_000,
  });
}

export function useAccessories(params: AccessoryListParams = {}) {
  return useQuery(accessoryListOptions(params));
}

export function useAccessory(idOrSlug: string) {
  return useQuery({
    queryKey: accessoryKeys.detail(idOrSlug),
    queryFn: () => fetchAccessory(idOrSlug),
    staleTime: 60_000,
    enabled: Boolean(idOrSlug),
  });
}
