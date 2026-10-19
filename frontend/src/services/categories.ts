import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { ApiCategory } from "@/lib/api/types";

export const categoryKeys = {
  all: ["categories"] as const,
  detail: (idOrSlug: string) => ["categories", idOrSlug] as const,
};

export async function fetchCategories(): Promise<ApiCategory[]> {
  return apiClient.get<ApiCategory[]>("/categories");
}

export async function fetchCategory(idOrSlug: string): Promise<ApiCategory> {
  return apiClient.get<ApiCategory>(`/categories/${encodeURIComponent(idOrSlug)}`);
}

/** Shared by the hook and by route loaders that prefetch for SSR. */
export function categoriesOptions() {
  return queryOptions({
    queryKey: categoryKeys.all,
    queryFn: fetchCategories,
    // Categories change rarely; keep them warm for the whole session.
    staleTime: 10 * 60_000,
  });
}

export function useCategories() {
  return useQuery(categoriesOptions());
}
