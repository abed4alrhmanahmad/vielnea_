import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMedia, mediaService, type MediaType } from "@/admin/services/misc";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/media")({
  head: () => ({
    meta: [{ title: "Media — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminMediaPage,
});

function AdminMediaPage() {
  const media = useMedia();
  function upload(file: File, type: MediaType) {
    const reader = new FileReader();
    reader.onload = () => {
      mediaService.add({ name: file.name, url: String(reader.result), type });
      toast.success("Uploaded");
    };
    reader.readAsDataURL(file);
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
                if (f) upload(f, "product");
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
                      if (f) upload(f, t);
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
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 size-6"
                      onClick={() => {
                        mediaService.remove(m.id);
                        toast("Deleted");
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
