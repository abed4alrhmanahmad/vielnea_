import { useMemo, useState } from "react";
import { Star, ThumbsUp, Flag, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useStore } from "@/contexts/store-context";
import { errorMessage } from "@/lib/api/client";
import {
  useProductReviews,
  useCreateReview,
  useToggleHelpful,
  useReportReview,
  useDeleteReview,
  type ReviewSort,
} from "@/services/product-reviews";
import type { ApiReview } from "@/lib/api/types";

function StarRow({
  value,
  size = 4,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const cls = `size-${size} ${filled ? "fill-primary text-primary" : "text-muted-foreground"}`;
        return onChange ? (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} stars`}>
            <Star className={cls} />
          </button>
        ) : (
          <Star key={n} className={cls} />
        );
      })}
    </div>
  );
}

export function ProductReviews({
  productId,
  productTitle,
}: {
  productId: string;
  productTitle: string;
}) {
  const { user } = useStore();
  const [sort, setSort] = useState<ReviewSort>("newest");
  const { reviews, stats, isLoading, isError, error } = useProductReviews(productId, sort);

  const createReview = useCreateReview(productId);
  const toggleHelpful = useToggleHelpful(productId);
  const reportReview = useReportReview(productId);
  const deleteReview = useDeleteReview(productId);

  // Own review is matched on user id, which the API returns for each review.
  const myReview = useMemo(
    () => (user ? reviews.find((r) => r.userId && r.userId === user.id) : undefined),
    [reviews, user],
  );

  const [editing, setEditing] = useState(false);
  const [draftRating, setDraftRating] = useState<number>(5);
  const [draftBody, setDraftBody] = useState<string>("");

  const openForm = () => {
    setDraftRating(myReview?.rating ?? 5);
    setDraftBody(myReview?.comment ?? "");
    setEditing(true);
  };

  const submit = async () => {
    if (!user) return;
    if (draftBody.trim().length < 3) {
      toast.error("Please write a short review");
      return;
    }
    try {
      await createReview.mutateAsync({ rating: draftRating, comment: draftBody.trim() });
      toast.success(myReview ? "Review updated" : "Thank you for your review");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save your review"));
    }
  };

  const remove = async () => {
    if (!myReview) return;
    try {
      await deleteReview.mutateAsync(myReview.id);
      toast("Review deleted");
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete your review"));
    }
  };

  const onHelpful = async (reviewId: string) => {
    if (!user) {
      toast("Sign in to mark helpful");
      return;
    }
    try {
      await toggleHelpful.mutateAsync(reviewId);
    } catch (err) {
      toast.error(errorMessage(err, "Could not register your vote"));
    }
  };

  const onReport = async (reviewId: string) => {
    if (!user) {
      toast("Sign in to report a review");
      return;
    }
    try {
      const result = await reportReview.mutateAsync(reviewId);
      toast(result.message);
    } catch (err) {
      toast.error(errorMessage(err, "Could not report this review"));
    }
  };

  const distMax = Math.max(1, ...Object.values(stats.distribution));

  return (
    <section className="container-luxe pb-24">
      <div className="border-t border-border pt-12">
        <h2 className="font-display text-3xl mb-8">Reviews</h2>

        <div className="grid md:grid-cols-[280px_1fr] gap-10">
          {/* Summary */}
          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-5xl text-primary">{stats.average.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">/ 5</span>
            </div>
            <div className="mt-2">
              <StarRow value={stats.average} size={4} />
            </div>
            <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">
              {stats.count} {stats.count === 1 ? "review" : "reviews"}
            </p>

            <div className="mt-6 space-y-2">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = stats.distribution[String(n) as "1" | "2" | "3" | "4" | "5"];
                const pct = stats.count ? (c / stats.count) * 100 : 0;
                return (
                  <div key={n} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-muted-foreground">{n}★</span>
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(c / distMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-8">
              {!user && <p className="text-xs text-muted-foreground">Sign in to leave a review.</p>}
              {user && !myReview && !editing && (
                <Button
                  onClick={openForm}
                  className="uppercase tracking-[0.2em] text-xs h-11 w-full"
                >
                  Write a Review
                </Button>
              )}
              {user && myReview && !editing && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={openForm}
                    className="flex-1 border-primary text-primary"
                  >
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void remove()}
                    disabled={deleteReview.isPending}
                    className="border-border"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
              {user && (
                <p className="text-xs text-muted-foreground mt-3">
                  Orders placed with this account are marked as verified purchases.
                </p>
              )}
            </div>
          </div>

          {/* List */}
          <div>
            {editing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 border border-border rounded-md p-5 bg-card"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  {myReview ? "Edit your review" : `Review ${productTitle}`}
                </p>
                <StarRow value={draftRating} size={5} onChange={setDraftRating} />
                <Textarea
                  className="mt-4"
                  rows={4}
                  placeholder="Share your thoughts on the fit, fabric and styling…"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  maxLength={1000}
                />
                <div className="mt-4 flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void submit()}
                    disabled={createReview.isPending}
                    className="uppercase tracking-[0.2em] text-xs"
                  >
                    {createReview.isPending ? "Saving…" : myReview ? "Save" : "Submit"}
                  </Button>
                </div>
              </motion.div>
            )}

            {reviews.length > 0 && (
              <div className="flex items-center justify-between mb-6">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Sort by</p>
                <Select value={sort} onValueChange={(v) => setSort(v as ReviewSort)}>
                  <SelectTrigger className="w-44 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="highest">Highest rating</SelectItem>
                    <SelectItem value="lowest">Lowest rating</SelectItem>
                    <SelectItem value="helpful">Most helpful</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {isLoading ? (
              <div className="space-y-6">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="h-9 w-48" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))}
              </div>
            ) : isError ? (
              <p className="text-sm text-muted-foreground">
                {errorMessage(error, "Reviews could not be loaded right now.")}
              </p>
            ) : reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reviews yet. Be the first to share your experience.
              </p>
            ) : (
              <ul className="space-y-6">
                {reviews.map((r) => (
                  <ReviewRow
                    key={r.id}
                    review={r}
                    onHelpful={() => void onHelpful(r.id)}
                    onReport={() => void onReport(r.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewRow({
  review,
  onHelpful,
  onReport,
}: {
  review: ApiReview;
  onHelpful: () => void;
  onReport: () => void;
}) {
  const helpfulCount = review.helpfulCount;
  const iVoted = review.viewerHasVotedHelpful ?? false;
  return (
    <li className="border-b border-border pb-6 last:border-b-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-secondary text-primary flex items-center justify-center text-sm font-medium">
            {review.authorName.slice(0, 1)}
          </div>
          <div>
            <p className="text-sm font-medium">{review.authorName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRow value={review.rating} size={3} />
              {review.verified && (
                <Badge variant="secondary" className="gap-1 text-[10px] uppercase tracking-widest">
                  <ShieldCheck className="size-3" /> Verified purchase
                </Badge>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(review.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
          {review.updatedAt !== review.createdAt && " · edited"}
        </p>
      </div>
      <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{review.comment}</p>
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <button
          onClick={onHelpful}
          className={`inline-flex items-center gap-1.5 hover:text-primary ${iVoted ? "text-primary" : ""}`}
        >
          <ThumbsUp className="size-3.5" /> Helpful{helpfulCount ? ` (${helpfulCount})` : ""}
        </button>
        <button onClick={onReport} className="inline-flex items-center gap-1.5 hover:text-primary">
          <Flag className="size-3.5" /> Report
        </button>
      </div>
    </li>
  );
}
