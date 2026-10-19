import { reviewRepository, type ReviewSort } from "../repositories/review.repository.js";
import { productRepository } from "../repositories/product.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { invalidateProductsCache } from "./product.service.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import type { Review, ReviewStats } from "../types/models.js";

/** Adds the `viewerHasVotedHelpful` flag when the request is authenticated. */
export interface ReviewWithViewerState extends Review {
  viewerHasVotedHelpful: boolean;
}

export const reviewService = {
  async listForProduct(
    productIdOrSlug: string,
    sort: ReviewSort,
    page: number,
    limit: number,
    viewerId?: string | undefined,
  ): Promise<{ reviews: ReviewWithViewerState[]; stats: ReviewStats; total: number }> {
    const productId = await productRepository.resolveId(productIdOrSlug);
    if (!productId) throw new NotFoundError("Product not found");

    const [{ reviews, total }, stats] = await Promise.all([
      reviewRepository.findByProduct(productId, sort, page, limit),
      reviewRepository.statsForProduct(productId),
    ]);

    const voted = viewerId
      ? await reviewRepository.findHelpfulVotes(
          viewerId,
          reviews.map((r) => r.id),
        )
      : new Set<string>();

    return {
      reviews: reviews.map((r) => ({ ...r, viewerHasVotedHelpful: voted.has(r.id) })),
      stats,
      total,
    };
  },

  async toggleHelpful(reviewId: string, userId: string): Promise<{ voted: boolean; review: Review }> {
    const existing = await reviewRepository.findById(reviewId);
    if (!existing) throw new NotFoundError("Review not found");

    const { voted } = await reviewRepository.toggleHelpful(reviewId, userId);
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw new NotFoundError("Review not found");
    return { voted, review };
  },

  async report(reviewId: string): Promise<void> {
    const ok = await reviewRepository.report(reviewId);
    if (!ok) throw new NotFoundError("Review not found");
  },

  async remove(reviewId: string, userId: string, isAdmin: boolean): Promise<void> {
    const existing = await reviewRepository.findById(reviewId);
    if (!existing) throw new NotFoundError("Review not found");

    const deleted = await reviewRepository.deleteOwn(reviewId, userId, isAdmin);
    if (!deleted) throw new ForbiddenError("You can only delete your own review");
    // The delete retriggers the rating sync, so cached listings are now stale.
    invalidateProductsCache();
  },

  /**
   * Creates or updates the signed-in user's review for a product.
   * `verified` is derived from order history, never from the request.
   */
  async create(
    userId: string,
    productIdOrSlug: string,
    input: { rating: number; comment: string; authorName?: string | undefined },
  ): Promise<Review> {
    const productId = await productRepository.resolveId(productIdOrSlug);
    if (!productId) throw new NotFoundError("Product not found");

    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const verified = await reviewRepository.hasPurchased(userId, productId);

    const review = await reviewRepository.upsert({
      productId,
      userId,
      authorName: input.authorName?.trim() || user.name,
      authorEmail: user.email,
      rating: input.rating,
      comment: input.comment,
      verified,
    });
    // The upsert retriggers the rating sync, so cached listings are now stale.
    invalidateProductsCache();
    return review;
  },
};
