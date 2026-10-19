import { queryMany, queryOne } from "../lib/db.js";
import type { Review, ReviewStats } from "../types/models.js";

interface ReviewRow {
  id: string;
  product_id: string;
  user_id: string | null;
  author_name: string;
  rating: number;
  comment: string;
  verified: boolean;
  helpful_count: number;
  created_at: Date;
  updated_at: Date;
}

const SORT_SQL = {
  newest: "created_at DESC",
  oldest: "created_at ASC",
  highest: "rating DESC, created_at DESC",
  lowest: "rating ASC, created_at DESC",
  helpful: "helpful_count DESC, created_at DESC",
} as const;

export type ReviewSort = keyof typeof SORT_SQL;

const SELECT = `
  SELECT id, product_id, user_id, author_name, rating, comment,
         verified, helpful_count, created_at, updated_at
  FROM public.reviews
`;

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id,
    productId: row.product_id,
    userId: row.user_id,
    authorName: row.author_name,
    rating: row.rating,
    comment: row.comment,
    verified: row.verified,
    helpfulCount: row.helpful_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export const reviewRepository = {
  async findByProduct(
    productId: string,
    sort: ReviewSort,
    page: number,
    limit: number,
  ): Promise<{ reviews: Review[]; total: number }> {
    // Hidden reviews are excluded from the storefront everywhere, including
    // the count and the rating breakdown.
    const countRow = await queryOne<{ total: number }>(
      "SELECT count(*)::int AS total FROM public.reviews WHERE product_id = $1 AND status <> 'hidden'",
      [productId],
    );
    const rows = await queryMany<ReviewRow>(
      `${SELECT} WHERE product_id = $1 AND status <> 'hidden'
       ORDER BY ${SORT_SQL[sort]} LIMIT $2 OFFSET $3`,
      [productId, limit, (page - 1) * limit],
    );
    return { reviews: rows.map(mapReview), total: countRow?.total ?? 0 };
  },

  /** Aggregate rating + 1..5 distribution for the reviews panel. */
  async statsForProduct(productId: string): Promise<ReviewStats> {
    const row = await queryOne<{
      count: number;
      average: number | null;
      r1: number;
      r2: number;
      r3: number;
      r4: number;
      r5: number;
    }>(
      `SELECT count(*)::int AS count,
              avg(rating)::float AS average,
              count(*) FILTER (WHERE rating = 1)::int AS r1,
              count(*) FILTER (WHERE rating = 2)::int AS r2,
              count(*) FILTER (WHERE rating = 3)::int AS r3,
              count(*) FILTER (WHERE rating = 4)::int AS r4,
              count(*) FILTER (WHERE rating = 5)::int AS r5
       FROM public.reviews WHERE product_id = $1 AND status <> 'hidden'`,
      [productId],
    );

    return {
      count: row?.count ?? 0,
      average: row?.average ?? 0,
      distribution: {
        "1": row?.r1 ?? 0,
        "2": row?.r2 ?? 0,
        "3": row?.r3 ?? 0,
        "4": row?.r4 ?? 0,
        "5": row?.r5 ?? 0,
      },
    };
  },

  /**
   * One review per user per product: a repeat submission updates the original
   * rather than erroring, which matches how the storefront form behaves.
   */
  async upsert(input: {
    productId: string;
    userId: string;
    authorName: string;
    authorEmail: string;
    rating: number;
    comment: string;
    verified: boolean;
  }): Promise<Review> {
    const row = await queryOne<ReviewRow>(
      `INSERT INTO public.reviews
         (product_id, user_id, author_name, author_email, rating, comment, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (product_id, user_id) DO UPDATE
         SET rating = EXCLUDED.rating,
             comment = EXCLUDED.comment,
             author_name = EXCLUDED.author_name,
             verified = EXCLUDED.verified
       RETURNING id, product_id, user_id, author_name, rating, comment,
                 verified, helpful_count, created_at, updated_at`,
      [
        input.productId,
        input.userId,
        input.authorName,
        input.authorEmail,
        input.rating,
        input.comment,
        input.verified,
      ],
    );
    if (!row) throw new Error("Failed to save review");
    return mapReview(row);
  },

  /** Ids of the reviews in `reviewIds` the user has marked helpful. */
  async findHelpfulVotes(userId: string, reviewIds: readonly string[]): Promise<Set<string>> {
    if (reviewIds.length === 0) return new Set();
    const rows = await queryMany<{ review_id: string }>(
      `SELECT review_id FROM public.review_helpful_votes
       WHERE user_id = $1 AND review_id = ANY($2::uuid[])`,
      [userId, reviewIds],
    );
    return new Set(rows.map((r) => r.review_id));
  },

  /** Toggles the vote; the helpful_count column is kept in sync by trigger. */
  async toggleHelpful(reviewId: string, userId: string): Promise<{ voted: boolean }> {
    const deleted = await queryOne<{ review_id: string }>(
      `DELETE FROM public.review_helpful_votes
       WHERE review_id = $1 AND user_id = $2
       RETURNING review_id`,
      [reviewId, userId],
    );
    if (deleted) return { voted: false };

    await queryOne(
      `INSERT INTO public.review_helpful_votes (review_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING review_id`,
      [reviewId, userId],
    );
    return { voted: true };
  },

  async report(reviewId: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      "UPDATE public.reviews SET reported = true WHERE id = $1 RETURNING id",
      [reviewId],
    );
    return row !== null;
  },

  /** Deletes the review only if it belongs to the user (or the caller is admin). */
  async deleteOwn(reviewId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const row = isAdmin
      ? await queryOne<{ id: string }>(
          "DELETE FROM public.reviews WHERE id = $1 RETURNING id",
          [reviewId],
        )
      : await queryOne<{ id: string }>(
          "DELETE FROM public.reviews WHERE id = $1 AND user_id = $2 RETURNING id",
          [reviewId, userId],
        );
    return row !== null;
  },

  async findById(reviewId: string): Promise<Review | null> {
    const row = await queryOne<ReviewRow>(`${SELECT} WHERE id = $1 LIMIT 1`, [reviewId]);
    return row ? mapReview(row) : null;
  },

  /** True when the user has a non-cancelled order containing the product. */
  async hasPurchased(userId: string, productId: string): Promise<boolean> {
    const row = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM public.order_items oi
         JOIN public.orders o ON o.id = oi.order_id
         WHERE o.user_id = $1 AND oi.product_id = $2 AND o.status <> 'cancelled'
       ) AS exists`,
      [userId, productId],
    );
    return row?.exists ?? false;
  },

  mapReview,
};
