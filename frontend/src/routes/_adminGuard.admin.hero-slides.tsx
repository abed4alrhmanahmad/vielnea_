import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil, Upload } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  useHeroSlides,
  heroSlidesService,
  uploadHeroImage,
  UPLOAD_ACCEPT_ATTRIBUTE,
  type AdminHeroSlide,
} from "@/admin/services/hero-slides-admin";
import { errorMessage } from "@/lib/api/client";
import { toast } from "sonner";

/**
 * CSS object-position presets for the slide image's cover crop. Values are
 * plain CSS, so anything the API accepts still works if set directly.
 */
const FOCAL_POINTS = [
  { value: "top", label: "Top — keeps heads and faces (default)" },
  { value: "center 25%", label: "Upper third" },
  { value: "center", label: "Centre" },
  { value: "center 75%", label: "Lower third" },
  { value: "bottom", label: "Bottom" },
] as const;

export const Route = createFileRoute("/_adminGuard/admin/hero-slides")({
  head: () => ({
    meta: [{ title: "Hero Slides — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: HeroSlidesPage,
});

function HeroSlidesPage() {
  const slides = useHeroSlides();
  const [editing, setEditing] = useState<AdminHeroSlide | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Hero Slides"
        description="Manage the homepage hero carousel"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add Slide
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
                <th>Heading</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {slides.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-b-0">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          aria-label="Move up"
                          onClick={() => heroSlidesService.reorder(s.id, -1)}
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          aria-label="Move down"
                          onClick={() => heroSlidesService.reorder(s.id, 1)}
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                      <span className="text-muted-foreground font-mono text-xs">
                        {s.displayOrder}
                      </span>
                    </div>
                  </td>
                  <td>
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt="" className="h-10 w-16 object-cover rounded" />
                    ) : (
                      <div className="h-10 w-16 bg-secondary rounded" />
                    )}
                  </td>
                  <td>
                    {/* Headings carry a newline that the storefront renders as a
                        line break; show it on one line here. */}
                    <div className="font-medium">{s.heading.replace(/\n/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{s.eyebrowText}</div>
                  </td>
                  <td>
                    <Switch
                      checked={s.isActive}
                      onCheckedChange={(v) => heroSlidesService.update(s.id, { isActive: v })}
                    />
                  </td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete this slide?`)) heroSlidesService.remove(s.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {slides.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No hero slides yet — add one to fill the homepage hero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {(editing || creating) && (
        <HeroSlideEditor
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

function HeroSlideEditor({
  initial,
  onClose,
}: {
  initial: AdminHeroSlide | null;
  onClose: () => void;
}) {
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [eyebrowText, setEyebrowText] = useState(initial?.eyebrowText ?? "");
  const [heading, setHeading] = useState(initial?.heading ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [buttonText, setButtonText] = useState(initial?.buttonText ?? "Shop Now");
  const [buttonLink, setButtonLink] = useState(initial?.buttonLink ?? "/shop");
  const [objectPosition, setObjectPosition] = useState(initial?.objectPosition ?? "top");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [displayOrder, setDisplayOrder] = useState(String(initial?.displayOrder ?? ""));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Same upload endpoint and bucket the product images use. */
  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setImageUrl(await uploadHeroImage(file));
      toast.success("Image uploaded");
    } catch (error) {
      toast.error(errorMessage(error, "Could not upload the image"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    if (!imageUrl.trim()) {
      toast.error("An image is required");
      return;
    }
    if (!heading.trim()) {
      toast.error("A heading is required");
      return;
    }

    const draft = {
      imageUrl: imageUrl.trim(),
      eyebrowText,
      heading,
      description,
      buttonText,
      buttonLink,
      isActive,
      objectPosition,
    };

    if (initial) {
      const order = Number.parseInt(displayOrder, 10);
      heroSlidesService.update(initial.id, {
        ...draft,
        ...(Number.isFinite(order) && order >= 0 ? { displayOrder: order } : {}),
      });
    } else {
      heroSlidesService.create(draft);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit" : "New"} Hero Slide</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Image</Label>
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className="mt-2 mb-2 w-full h-32 object-cover rounded border border-border"
              />
            )}
            <div className="flex gap-2">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="/images/brand/vielinea-hero.jpg or an uploaded URL"
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
            <Label>Eyebrow text</Label>
            <Input value={eyebrowText} onChange={(e) => setEyebrowText(e.target.value)} />
          </div>
          <div>
            <Label>Heading</Label>
            <Textarea
              rows={2}
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder={"Timeless\nElegance"}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Each new line renders as a separate line in the hero.
            </p>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Button text</Label>
              <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} />
            </div>
            <div>
              <Label>Button link</Label>
              <Input value={buttonLink} onChange={(e) => setButtonLink(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Image focal point</Label>
            <select
              value={
                FOCAL_POINTS.some((f) => f.value === objectPosition) ? objectPosition : "custom"
              }
              onChange={(e) => {
                if (e.target.value !== "custom") setObjectPosition(e.target.value);
              }}
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {FOCAL_POINTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
              {!FOCAL_POINTS.some((f) => f.value === objectPosition) && (
                <option value="custom">Custom — {objectPosition}</option>
              )}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              The hero frame is wider than most photographs, so part of the image height is always
              cropped. This picks which part is kept — &ldquo;Top&rdquo; keeps heads and faces
              whole.
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
