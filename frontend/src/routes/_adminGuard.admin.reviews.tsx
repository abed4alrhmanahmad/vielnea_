import { createFileRoute } from "@tanstack/react-router";
import { Star, Check, EyeOff, Trash2 } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useReviews, reviewsService } from "@/admin/services/misc";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/reviews")({
  head: () => ({
    meta: [{ title: "Reviews — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminReviewsPage,
});

function AdminReviewsPage() {
  const reviews = useReviews();
  return (
    <div>
      <PageHeader
        title="Reviews"
        description={`${reviews.filter((r) => r.status === "pending").length} pending`}
      />
      <div className="space-y-3">
        {reviews.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                  <span className="font-medium">{r.author}</span>
                  <span className="text-xs text-muted-foreground">on {r.productTitle}</span>
                  <Badge
                    variant={
                      r.status === "approved"
                        ? "default"
                        : r.status === "hidden"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {r.status}
                  </Badge>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`size-3 ${i < r.rating ? "text-primary fill-primary" : "text-muted-foreground"}`}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">{r.body}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    reviewsService.update(r.id, { status: "approved" });
                    toast.success("Approved");
                  }}
                >
                  <Check className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    reviewsService.update(r.id, { status: "hidden" });
                    toast("Hidden");
                  }}
                >
                  <EyeOff className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    reviewsService.remove(r.id);
                    toast("Deleted");
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
