import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil } from "lucide-react";
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
import { useCategories, categoriesService, type AdminCategory } from "@/admin/services/categories";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/categories")({
  head: () => ({
    meta: [{ title: "Categories — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const cats = useCategories();
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Manage product categories"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add Category
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="p-3">Order</th>
                <th>Image</th>
                <th>Name</th>
                <th>Key</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-b-0">
                  <td className="p-3">
                    <div className="flex flex-col">
                      <button onClick={() => categoriesService.reorder(c.id, -1)}>
                        <ArrowUp className="size-3" />
                      </button>
                      <button onClick={() => categoriesService.reorder(c.id, 1)}>
                        <ArrowDown className="size-3" />
                      </button>
                    </div>
                  </td>
                  <td>
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="size-10 object-cover rounded" />
                    ) : (
                      <div className="size-10 bg-secondary rounded" />
                    )}
                  </td>
                  <td className="font-medium">{c.label}</td>
                  <td className="text-muted-foreground font-mono text-xs">{c.key}</td>
                  <td>
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={(v) => categoriesService.update(c.id, { enabled: v })}
                    />
                  </td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete ${c.label}?`)) {
                          categoriesService.remove(c.id);
                          toast.success("Deleted");
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {(editing || creating) && (
        <CategoryEditor
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

function CategoryEditor({
  initial,
  onClose,
}: {
  initial: AdminCategory | null;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [key, setKey] = useState(initial?.key ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  function save() {
    if (!label.trim()) {
      toast.error("Name required");
      return;
    }
    if (initial) categoriesService.update(initial.id, { label, key, imageUrl, enabled });
    else
      categoriesService.create({
        label,
        key: key || label.toLowerCase().replace(/\s+/g, "-"),
        imageUrl,
        enabled,
      });
    toast.success("Saved");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit" : "New"} Category</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label>Key (slug)</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <div>
            <Label>Image URL</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} /> Enabled
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
