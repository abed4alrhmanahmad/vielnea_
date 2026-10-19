import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  useAdminTimeline,
  timelineService,
  uploadTimelineImage,
  UPLOAD_ACCEPT_ATTRIBUTE,
  type AdminTimelineEntry,
} from "@/admin/services/company-timeline-admin";
import { errorMessage } from "@/lib/api/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/timeline")({
  head: () => ({
    meta: [{ title: "Company Timeline — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: TimelinePage,
});

function TimelinePage() {
  const { enabled, sectionId, eyebrowText, heading, description, entries } = useAdminTimeline();
  const [editing, setEditing] = useState<AdminTimelineEntry | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Company Timeline"
        description="The Our Story milestones on the About page"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add Entry
          </Button>
        }
      />

      {/* Feature-level switch. Separate from each entry's Active toggle: this
          hides the whole section, and never deletes anything. */}
      <Card className="mb-6">
        <CardContent className="flex items-center justify-between gap-6 py-4">
          <div>
            <p className="font-medium">Show Company Timeline on About Page</p>
            <p className="text-sm text-muted-foreground">
              Turning this off hides the entire section from the About page. Your entries stay saved
              and reappear when you turn it back on.
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={!sectionId}
            aria-label="Show Company Timeline on About Page"
            onCheckedChange={(v) => {
              if (sectionId) timelineService.setEnabled(sectionId, v);
            }}
          />
        </CardContent>
      </Card>

      <TimelineHeaderForm
        sectionId={sectionId}
        eyebrowText={eyebrowText}
        heading={heading}
        description={description}
      />

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="p-3">Order</th>
                <th>Image</th>
                <th>Year</th>
                <th>Title</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/60 last:border-b-0">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          aria-label="Move up"
                          onClick={() => timelineService.reorder(e.id, -1)}
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          aria-label="Move down"
                          onClick={() => timelineService.reorder(e.id, 1)}
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                      <span className="text-muted-foreground font-mono text-xs">
                        {e.displayOrder}
                      </span>
                    </div>
                  </td>
                  <td>
                    {/* Images are optional; entries without one show a placeholder here. */}
                    {e.imageUrl ? (
                      <img src={e.imageUrl} alt="" className="h-10 w-16 object-cover rounded" />
                    ) : (
                      <div className="h-10 w-16 bg-secondary rounded" />
                    )}
                  </td>
                  <td className="font-display text-lg text-primary">{e.year}</td>
                  <td className="font-medium">{e.title}</td>
                  <td>
                    <Switch
                      checked={e.isActive}
                      aria-label={`Show the ${e.year} entry`}
                      onCheckedChange={(v) => timelineService.update(e.id, { isActive: v })}
                    />
                  </td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete the ${e.year} entry?`)) timelineService.remove(e.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No timeline entries yet — add one to start the company story.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(editing || creating) && (
        <TimelineEditor
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

/**
 * The section's eyebrow / heading / description. These live on the CMS
 * `timeline` section — the same record the feature switch writes to — so this
 * form saves through the existing section endpoint rather than a new one.
 */
function TimelineHeaderForm({
  sectionId,
  eyebrowText,
  heading,
  description,
}: {
  sectionId: string | null;
  eyebrowText: string;
  heading: string;
  description: string;
}) {
  const [eyebrow, setEyebrow] = useState(eyebrowText);
  const [title, setTitle] = useState(heading);
  const [body, setBody] = useState(description);

  // The values arrive with the query, so seed the fields once they land (and
  // again if another tab changes them). Same approach as the Site Content
  // screen's forms.
  useEffect(() => {
    setEyebrow(eyebrowText);
    setTitle(heading);
    setBody(description);
  }, [eyebrowText, heading, description]);

  const dirty = eyebrow !== eyebrowText || title !== heading || body !== description;

  return (
    <Card className="mb-6">
      <CardContent className="space-y-3 py-4">
        <div>
          <p className="font-medium">Section header</p>
          <p className="text-sm text-muted-foreground">
            The heading shown above the milestones on the About page.
          </p>
        </div>
        <div>
          <Label>Eyebrow</Label>
          <Input
            value={eyebrow}
            onChange={(e) => setEyebrow(e.target.value)}
            placeholder="Small line above the heading"
          />
        </div>
        <div>
          <Label>Heading</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The section title"
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="A sentence introducing the timeline"
          />
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!sectionId || !dirty}
            onClick={() => {
              if (sectionId) {
                timelineService.saveHeader(sectionId, {
                  eyebrowText: eyebrow,
                  heading: title,
                  description: body,
                });
              }
            }}
          >
            Save header
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineEditor({
  initial,
  onClose,
}: {
  initial: AdminTimelineEntry | null;
  onClose: () => void;
}) {
  const [year, setYear] = useState(initial?.year ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [displayOrder, setDisplayOrder] = useState(String(initial?.displayOrder ?? ""));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Same upload endpoint and bucket the product and hero images use. */
  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setImageUrl(await uploadTimelineImage(file));
      toast.success("Image uploaded");
    } catch (error) {
      toast.error(errorMessage(error, "Could not upload the image"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    if (!year.trim()) {
      toast.error("A year is required");
      return;
    }
    if (!title.trim()) {
      toast.error("A title is required");
      return;
    }

    const draft = {
      year: year.trim(),
      title: title.trim(),
      description,
      imageUrl: imageUrl.trim(),
      isActive,
    };

    if (initial) {
      const order = Number.parseInt(displayOrder, 10);
      timelineService.update(initial.id, {
        ...draft,
        ...(Number.isFinite(order) && order >= 0 ? { displayOrder: order } : {}),
      });
    } else {
      timelineService.create(draft);
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit" : "New"} Timeline Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Year</Label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            <p className="mt-1 text-xs text-muted-foreground">
              Any label works — a year, a range, or a word like &ldquo;Today&rdquo;.
            </p>
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label>Image (optional)</Label>
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
                placeholder="Leave empty for a text-only milestone"
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
