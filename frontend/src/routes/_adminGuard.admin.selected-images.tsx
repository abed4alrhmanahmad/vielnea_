import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil, Upload, ExternalLink } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  useSelectedImages,
  selectedImagesService,
  uploadSelectedImage,
  UPLOAD_ACCEPT_ATTRIBUTE,
  type AdminSelectedImage,
} from "@/admin/services/selected-images-admin";
import { errorMessage } from "@/lib/api/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/selected-images")({
  head: () => ({
    meta: [{ title: "Selected Images — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: SelectedImagesPage,
});

/** Shortens a URL for the table without hiding which post it points at. */
function shortUrl(url: string): string {
  return url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/**
 * Manages the individual images shown in the homepage Instagram marquee.
 *
 * The screen is built around one idea: ONE IMAGE = ONE ROW. A row is a single
 * picture plus the post it links to, never a whole Instagram post. Picking
 * three pictures out of one carousel means three rows that share a URL, so the
 * table calls that out explicitly rather than letting it look like a mistake.
 */
function SelectedImagesPage() {
  const images = useSelectedImages();
  const [editing, setEditing] = useState<AdminSelectedImage | null>(null);
  const [creating, setCreating] = useState(false);

  // How many rows point at each post, so a shared URL reads as intentional.
  // Rows with no link are skipped: several of those are not "the same post".
  const sharedCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const image of images) {
      if (!image.instagramUrl) continue;
      counts.set(image.instagramUrl, (counts.get(image.instagramUrl) ?? 0) + 1);
    }
    return counts;
  }, [images]);

  const activeCount = images.filter((i) => i.isActive).length;

  return (
    <div>
      <PageHeader
        title="Selected Images"
        description="Each row is one image in the homepage Instagram strip, with the post it links to"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add Image
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="p-3">Order</th>
                <th>Image</th>
                <th>Instagram URL</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {images.map((image) => {
                const shared = image.instagramUrl ? (sharedCount.get(image.instagramUrl) ?? 1) : 1;
                return (
                  <tr key={image.id} className="border-b border-border/60 last:border-b-0">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            aria-label="Move up"
                            onClick={() => selectedImagesService.reorder(image.id, -1)}
                          >
                            <ArrowUp className="size-3" />
                          </button>
                          <button
                            aria-label="Move down"
                            onClick={() => selectedImagesService.reorder(image.id, 1)}
                          >
                            <ArrowDown className="size-3" />
                          </button>
                        </div>
                        <span className="text-muted-foreground font-mono text-xs">
                          {image.displayOrder}
                        </span>
                      </div>
                    </td>
                    <td>
                      {image.imageUrl ? (
                        // Square, like the marquee tile, so the preview shows
                        // the crop that will actually ship.
                        <img
                          src={image.imageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-12 object-cover object-center rounded"
                        />
                      ) : (
                        <div className="size-12 bg-secondary rounded" />
                      )}
                    </td>
                    <td className="max-w-[320px]">
                      {image.instagramUrl ? (
                        <a
                          href={image.instagramUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 truncate text-primary hover:underline"
                        >
                          <span className="truncate">{shortUrl(image.instagramUrl)}</span>
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : (
                        // No link is a valid choice, not a missing value, so it
                        // states where the tile actually goes instead.
                        <span className="text-muted-foreground">No link — opens the homepage</span>
                      )}
                      {shared > 1 && (
                        // Several images from the same post is the expected
                        // workflow, so say so rather than leaving it looking
                        // like a duplicated row.
                        <div className="text-xs text-muted-foreground">
                          Same post as {shared - 1} other image{shared - 1 === 1 ? "" : "s"}
                        </div>
                      )}
                    </td>
                    <td>
                      <Switch
                        checked={image.isActive}
                        onCheckedChange={(v) =>
                          selectedImagesService.update(image.id, { isActive: v })
                        }
                      />
                    </td>
                    <td className="text-right pr-3">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(image)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this image from the Instagram strip?")) {
                            selectedImagesService.remove(image.id);
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {images.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No images selected yet — the Instagram strip stays hidden on the homepage until
                    you add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {images.length > 0 && activeCount === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Every image is switched off, so the Instagram strip is hidden on the homepage.
        </p>
      )}
      {(editing || creating) && (
        <SelectedImageEditor
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function SelectedImageEditor({
  initial,
  onClose,
}: {
  initial: AdminSelectedImage | null;
  onClose: () => void;
}) {
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  // Held as a string so the field can be cleared; "" is sent as null on save.
  const [instagramUrl, setInstagramUrl] = useState(initial?.instagramUrl ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [displayOrder, setDisplayOrder] = useState(String(initial?.displayOrder ?? ""));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Same upload endpoint and bucket the product images use. */
  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setImageUrl(await uploadSelectedImage(file));
      toast.success("Image uploaded");
    } catch (error) {
      toast.error(errorMessage(error, "Could not upload the image"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /**
   * Mirrors the server's rule so a typo is caught before the round trip. The
   * API re-validates and is what actually decides — this is UX only.
   *
   * Blank is valid: it means "no link", and the tile falls back to the
   * homepage. Only a value the admin actually typed is checked.
   */
  function instagramUrlProblem(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return "Enter a full link, e.g. https://www.instagram.com/p/XXXXXXXXXXX/";
    }
    if (url.protocol !== "https:") return "The link must start with https://";
    if (!["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) {
      return "The link must point to instagram.com";
    }
    return null;
  }

  const urlProblem = instagramUrlProblem(instagramUrl);

  function save() {
    // The picture stays mandatory: a row with no image has nothing to show.
    if (!imageUrl.trim()) {
      toast.error("An image is required");
      return;
    }
    const problem = instagramUrlProblem(instagramUrl);
    if (problem) {
      toast.error(problem);
      return;
    }

    const draft = {
      imageUrl: imageUrl.trim(),
      // Blank is stored as null, which is what makes the tile fall back to the
      // homepage. Sending "" would persist an empty string and produce an
      // href that links to the current page instead.
      instagramUrl: instagramUrl.trim() || null,
      isActive,
    };

    if (initial) {
      const order = Number.parseInt(displayOrder, 10);
      selectedImagesService.update(initial.id, {
        ...draft,
        ...(Number.isFinite(order) && order >= 0 ? { displayOrder: order } : {}),
      });
    } else {
      selectedImagesService.create(draft);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit" : "New"} Selected Image</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            One record is one picture. To show several pictures from the same Instagram post, add
            them one at a time and give each the same post URL.
          </p>
          <div>
            <Label>Image</Label>
            {imageUrl && (
              // Square preview: the marquee tile is `aspect-square`, so this is
              // the crop the homepage will show.
              <img
                src={imageUrl}
                alt=""
                className="mt-2 mb-2 size-32 object-cover object-center rounded border border-border"
              />
            )}
            <div className="flex gap-2">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Upload a file, or paste an image URL"
              />
              <input
                ref={fileRef}
                type="file"
                accept={UPLOAD_ACCEPT_ATTRIBUTE}
                className="hidden"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" />
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
          <div>
            <Label>Instagram URL (optional)</Label>
            <Input
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              placeholder="https://www.instagram.com/p/XXXXXXXXXXX/"
              aria-invalid={urlProblem ? true : undefined}
            />
            <p
              className={`mt-1 text-xs ${urlProblem ? "text-destructive" : "text-muted-foreground"}`}
            >
              {urlProblem ??
                (instagramUrl.trim()
                  ? "Where this image sends visitors. Several images may share the same post URL."
                  : "Leave blank and this image opens the Vielinea homepage instead.")}
            </p>
          </div>
          {initial && (
            <div>
              <Label>Display order</Label>
              <Input
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} /> Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={uploading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
