import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Star } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useAdminAccessories,
  accessoriesService,
  uploadAccessoryImage,
  UPLOAD_ACCEPT_ATTRIBUTE,
  type AdminAccessory,
} from "@/admin/services/accessories-admin";
import { errorMessage } from "@/lib/api/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/accessories")({
  head: () => ({
    meta: [{ title: "Accessories — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AccessoriesPage,
});

/**
 * Accessories management. Deliberately a separate section from Products:
 * accessories are complementary / gift items in their own table, with no
 * category, no sizes and no measurements, and they never appear in the
 * storefront's product category or filter system.
 */
function AccessoriesPage() {
  const accessories = useAdminAccessories();
  const [query, setQuery] = useState("");
  const [filterAvailability, setFilterAvailability] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "price" | "stock" | "order">("order");
  const [editing, setEditing] = useState<AdminAccessory | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    let rows = accessories;
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q),
      );
    }
    if (filterAvailability === "available") rows = rows.filter((a) => a.isAvailable);
    if (filterAvailability === "hidden") rows = rows.filter((a) => !a.isAvailable);
    return rows.slice().sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "price") return b.price - a.price;
      if (sort === "stock") return b.stock - a.stock;
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });
  }, [accessories, query, filterAvailability, sort]);

  return (
    <div>
      <PageHeader
        title="Accessories"
        description={`${accessories.length} accessories — complementary gift items, kept separate from products`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add Accessory
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={filterAvailability} onValueChange={setFilterAvailability}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accessories</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as "name" | "price" | "stock" | "order")}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="order">Sort: Display order</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="price">Sort: Price</SelectItem>
              <SelectItem value="stock">Sort: Stock</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground border-b border-border">
                <th className="p-3">Accessory</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Availability</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border/60 last:border-b-0 hover:bg-secondary/30"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {a.images[0] ? (
                        <img src={a.images[0]} alt="" className="size-12 object-cover rounded" />
                      ) : (
                        <div className="size-12 rounded bg-secondary flex items-center justify-center text-[10px] text-muted-foreground">
                          No image
                        </div>
                      )}
                      <div>
                        <div className="font-medium flex items-center gap-1">
                          {a.name}
                          {a.isFeatured && <Star className="size-3 text-primary fill-primary" />}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{a.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    ${a.price}
                    {a.discount > 0 && (
                      <span className="text-xs text-primary ml-1">-{a.discount}%</span>
                    )}
                  </td>
                  <td>
                    <Badge
                      variant={
                        a.stock === 0 ? "destructive" : a.stock <= 5 ? "secondary" : "outline"
                      }
                    >
                      {a.stock}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={a.isAvailable ? "default" : "secondary"}>
                      {a.isAvailable ? "Available" : "Hidden"}
                    </Badge>
                  </td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        // remove() reports its own success/failure once the
                        // request resolves.
                        if (confirm(`Delete ${a.name}?`)) accessoriesService.remove(a.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No accessories yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(editing || creating) && (
        <AccessoryEditor
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

function AccessoryEditor({
  initial,
  onClose,
}: {
  initial: AdminAccessory | null;
  onClose: () => void;
}) {
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial?.price ?? 0);
  const [discount, setDiscount] = useState(initial?.discount ?? 0);
  const [stock, setStock] = useState(initial?.stock ?? 0);
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isAvailable, setIsAvailable] = useState(initial?.isAvailable ?? true);
  const [isFeatured, setIsFeatured] = useState(initial?.isFeatured ?? false);
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);

  function addImageUrl() {
    const url = window.prompt("Image URL (or data URL)");
    if (url) setImages((prev) => [...prev, url]);
  }

  async function addImageFile(file: File) {
    // Uploaded to Supabase Storage first; the accessory stores the returned
    // URL, the same shape as a pasted one.
    setUploading(true);
    try {
      const url = await uploadAccessoryImage(file);
      setImages((prev) => [...prev, url]);
    } catch (error) {
      toast.error(errorMessage(error, "Could not upload the image"));
    } finally {
      setUploading(false);
    }
  }

  function moveImage(idx: number, dir: -1 | 1) {
    const swap = idx + dir;
    if (swap < 0 || swap >= images.length) return;
    const next = images.slice();
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setImages(next);
  }

  function save() {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    const payload = {
      name: name.trim(),
      description,
      price: Number(price),
      discount: Number(discount),
      stock: Number(stock),
      sortOrder: Number(sortOrder),
      isAvailable,
      isFeatured,
      images,
    };
    // The service reports success or failure itself once the request resolves.
    if (isNew) accessoriesService.create(payload);
    else accessoriesService.update(initial!.id, payload);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Accessory" : `Edit — ${initial?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label>Price ($)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(+e.target.value)} />
          </div>
          <div>
            <Label>Discount (%)</Label>
            <Input type="number" value={discount} onChange={(e) => setDiscount(+e.target.value)} />
          </div>
          <div>
            <Label>Stock</Label>
            <Input type="number" value={stock} onChange={(e) => setStock(+e.target.value)} />
          </div>
          <div>
            <Label>Display order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(+e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Status</Label>
            <div className="flex items-center gap-6 h-10">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
                Available on the storefront
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
                Featured
              </label>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <Label>Images</Label>
              <div className="flex gap-2">
                <label className="text-xs px-3 py-1.5 border border-border rounded cursor-pointer hover:bg-secondary">
                  {uploading ? "Uploading..." : "Upload"}
                  <input
                    type="file"
                    accept={UPLOAD_ACCEPT_ATTRIBUTE}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // Cleared so picking the same file again still fires.
                      e.target.value = "";
                      if (f) void addImageFile(f);
                    }}
                  />
                </label>
                <Button size="sm" variant="outline" onClick={addImageUrl}>
                  Add URL
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {images.map((src, i) => (
                <div
                  key={i}
                  className={`relative border rounded overflow-hidden ${i === 0 ? "ring-2 ring-primary" : "border-border"}`}
                >
                  {/* Matches the storefront accessory card's 3:4 centred cover,
                      so the preview and the public page crop identically. */}
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-[3/4] object-cover object-center"
                  />
                  <div className="absolute top-1 right-1 flex gap-1">
                    <button
                      className="bg-background/80 text-xs px-1"
                      onClick={() => moveImage(i, -1)}
                    >
                      ←
                    </button>
                    <button
                      className="bg-background/80 text-xs px-1"
                      onClick={() => moveImage(i, 1)}
                    >
                      →
                    </button>
                    <button
                      className="bg-background/80 text-xs px-1"
                      onClick={() => setImages(images.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </div>
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 right-1 text-[10px] bg-background/80 py-0.5 text-center">
                      Main image
                    </span>
                  )}
                </div>
              ))}
              {images.length === 0 && (
                <p className="col-span-4 text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded">
                  No images yet — upload one from your computer or paste a URL
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              The first image is the one shown on the Accessories page. Use the arrows to reorder.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{isNew ? "Create" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
