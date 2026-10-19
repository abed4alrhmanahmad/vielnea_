/**
 * Shared plumbing for the admin service layer.
 *
 * The admin components were written against synchronous localStorage services:
 * hooks return a plain array, and mutations are fire-and-forget. These helpers
 * keep exactly that shape while the data actually comes from the Express API,
 * so no admin component needed rewriting.
 */
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiClient, errorMessage } from "@/lib/api/client";

/**
 * The imperative service methods (create/update/remove) run outside React and
 * still need to refresh the cache the hooks read from. The app builds a
 * QueryClient per request for SSR, so a module singleton would be wrong;
 * instead the active client is registered from inside the provider, on the
 * client only.
 */
let activeQueryClient: QueryClient | null = null;

function useRegisterQueryClient(): QueryClient {
  const queryClient = useQueryClient();
  useEffect(() => {
    activeQueryClient = queryClient;
  }, [queryClient]);
  return queryClient;
}

export function invalidateAdmin(...keys: Array<readonly unknown[]>): void {
  if (!activeQueryClient) return;
  for (const key of keys) {
    void activeQueryClient.invalidateQueries({ queryKey: key });
  }
}

/** Reads a list endpoint into the array shape the admin components expect. */
export function useAdminList<TApi, TView>(
  key: readonly unknown[],
  path: string,
  map: (rows: TApi[]) => TView[],
  enabled = true,
): TView[] {
  useRegisterQueryClient();

  const query = useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<TApi[]>(path),
    enabled,
    staleTime: 15_000,
    retry: 1,
  });

  // `map` is redefined each render by callers, so memoise on the data itself.
  // The mapping is pure, which makes that safe.
  const data = query.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (data ? map(data) : []), [data]);
}

/** Single-object variant, for endpoints that return one record. */
export function useAdminRecord<TApi, TView>(
  key: readonly unknown[],
  path: string,
  map: (row: TApi) => TView,
  fallback: TView,
  enabled = true,
): TView {
  useRegisterQueryClient();

  const query = useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<TApi>(path),
    enabled,
    staleTime: 15_000,
    retry: 1,
  });

  const data = query.data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (data ? map(data) : fallback), [data]);
}

/**
 * Runs an admin mutation, surfacing failures as a toast and refreshing the
 * affected caches. Callers do not await — matching the old sync services.
 */
export function runAdminMutation(
  action: () => Promise<unknown>,
  options: { invalidate?: Array<readonly unknown[]>; success?: string; failure?: string } = {},
): void {
  void action()
    .then(() => {
      if (options.invalidate) invalidateAdmin(...options.invalidate);
      if (options.success) toast.success(options.success);
    })
    .catch((error: unknown) => {
      toast.error(errorMessage(error, options.failure ?? "That action could not be completed"));
    });
}

export const adminKeys = {
  stats: ["admin", "stats"] as const,
  products: ["admin", "products"] as const,
  accessories: ["admin", "accessories"] as const,
  categories: ["admin", "categories"] as const,
  heroSlides: ["admin", "hero-slides"] as const,
  selectedImages: ["admin", "selected-images"] as const,
  timeline: ["admin", "company-timeline"] as const,
  faqs: ["admin", "faqs"] as const,
  orders: ["admin", "orders"] as const,
  customers: ["admin", "customers"] as const,
  reviews: ["admin", "reviews"] as const,
};

export { apiClient };
