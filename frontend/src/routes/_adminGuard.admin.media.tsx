import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMedia, mediaService, type MediaType } from "@/admin/services/misc";
import { uploadProductImage } from "@/admin/services/products-admin";
import { errorMessage } from "@/lib/api/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/media")({
  head: () => ({
    meta: [{ title: "Media — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminMediaPage,
});

function AdminMediaPage() {
  const media = useMedia();
  // The file goes to storage first (the same upload every other admin image
  // uses); the library row stores only the returned URL. Posting the file
  // itself as a data: URL was always rejected — the API caps url at 500 chars.
  async function upload(file: File, type: MediaType) {
    let url: string;
    try {
      url = await uploadProductImage(file);
    } catch (error) {
      toast.error(errorMessage(error, "Could not upload the image"));
      return;
    }
    // add() reports its own success/failure once the request resolves.
    mediaService.add({ name: file.name, url, type });
  }
  const types: MediaType[] = ["product", "hero", "banner", "category"];
  return (
    <div>
      <PageHeader
        title="Media Library"
        description="Manage store imagery"
        actions={
          <label className="inline-flex items-center gap-2 px-3 h-9 border border-border rounded text-sm cursor-pointer hover:bg-secondary">
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Cleared so picking the same file again still fires.
                e.target.value = "";
                if (f) void upload(f, "product");
              }}
            />
          </label>
        }
      />
      {types.map((t) => {
        const rows = media.filter((m) => m.type === t);
        return (
          <Card key={t} className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg capitalize">
                  {t} images ({rows.length})
                </h3>
                <label className="text-xs px-2 py-1 border border-border rounded cursor-pointer hover:bg-secondary">
                  Upload {t}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void upload(f, t);
                    }}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {rows.map((m) => (
                  <div key={m.id} className="relative group">
                    <img
                      src={m.url}
                      alt={m.name}
                      className="w-full h-24 object-cover rounded border border-border"
                    />
                    <Button
                      size="icon"
                      variant="secondary"
                      // Always visible on touch screens, where there is no hover.
                      className="absolute top-1 right-1 sm:opacity-0 sm:group-hover:opacity-100 size-6"
                      onClick={() => {
                        if (confirm(`Delete ${m.name}?`)) mediaService.remove(m.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
                {rows.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground py-6 text-center">
                    No {t} images yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
