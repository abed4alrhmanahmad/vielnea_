/**
 * Product reviews, served by the Express API.
 *
 * Replaces the localStorage-backed reviews store for the storefront. The hook
 * signature intentionally mirrors the previous `useProductReviews` so the
 * existing reviews component needed only its data source swapped.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { ApiReview, ApiReviewStats, ApiReviewsResponse } from "@/lib/api/types";

export type ReviewSort = "newest" | "oldest" | "highest" | "lowest" | "helpful";

export const reviewKeys = {
  forProduct: (slug: string, sort: ReviewSort) => ["reviews", slug, sort] as const,
};

const EMPTY_STATS: ApiReviewStats = {
  count: 0,
  average: 0,
  distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
};

export async function fetchProductReviews(
  slug: string,
  sort: ReviewSort,
): Promise<ApiReviewsResponse> {
  return apiClient.get<ApiReviewsResponse>(`/products/${encodeURIComponent(slug)}/reviews`, {
    params: { sort, limit: 50 },
  });
}

export interface CreateReviewInput {
  rating: number;
  comment: string;
  authorName?: string;
}

export async function createProductReview(
  slug: string,
  input: CreateReviewInput,
): Promise<ApiReview> {
  return apiClient.post<ApiReview>(`/products/${encodeURIComponent(slug)}/reviews`, input);
}

export function useProductReviews(slug: string, sort: ReviewSort = "newest") {
  const query = useQuery({
    queryKey: reviewKeys.forProduct(slug, sort),
    queryFn: () => fetchProductReviews(slug, sort),
    enabled: Boolean(slug),
    staleTime: 30_000,
  });

  return {
    reviews: query.data?.reviews ?? [],
    stats: query.data?.stats ?? EMPTY_STATS,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export function useCreateReview(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReviewInput) => createProductReview(slug, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews", slug] });
    },
  });
}

export function useToggleHelpful(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) =>
      apiClient.post<{ voted: boolean; review: ApiReview }>(
        `/products/${encodeURIComponent(slug)}/reviews/${reviewId}/helpful`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews", slug] });
    },
  });
}

export function useReportReview(slug: string) {
  return useMutation({
    mutationFn: (reviewId: string) =>
      apiClient.post<{ message: string }>(
        `/products/${encodeURIComponent(slug)}/reviews/${reviewId}/report`,
      ),
  });
}

export function useDeleteReview(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) =>
      apiClient.delete<{ message: string }>(
        `/products/${encodeURIComponent(slug)}/reviews/${reviewId}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews", slug] });
    },
  });
}
