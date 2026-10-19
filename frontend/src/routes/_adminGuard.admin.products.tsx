import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Star } from "lucide-react";
import placeholderImg from "@/assets/product-dress.jpg";
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
  useAdminProducts,
  productsService,
  uploadProductImage,
  UPLOAD_ACCEPT_ATTRIBUTE,
  type AdminProduct,
} from "@/admin/services/products-admin";
import { errorMessage } from "@/lib/api/client";
import type { Category } from "@/data/products";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/products")({
  head: () => ({
    meta: [{ title: "Products — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: ProductsPage,
});

const CATEGORIES: Category[] = [
  "dresses",
  "blouses",
  "pants",
  "skirts",
  "tops",
  "handbags",
  "jewelry",
  "accessories",
];

/**
 * Radix Select reserves an empty item value for "nothing selected" (its
 * root `value` may be "", but a `Select.Item` may not) — this sentinel is
 * the explicit "No category" menu entry and never leaves this component; it
 * is translated back to "" wherever the category is read.
 */
const NO_CATEGORY = "__no_category__";

/**
 * Hides the native up/down spinner on a number input while keeping it a
 * real numeric field — direct keyboard typing, backspace, select-and-replace
 * and paste all keep working. Scoped to Price/Discount/Stock only.
 */
const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0";

function ProductsPage() {
  const products = useAdminProducts();
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [sort, setSort] = useState<"title" | "price" | "stock">("title");
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    let rows = products;
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (p) => p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
      );
    }
    if (filterCat !== "all") rows = rows.filter((p) => p.category === filterCat);
    return rows.slice().sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "price") return b.price - a.price;
      return b.stock - a.stock;
    });
  }, [products, query, filterCat, sort]);

  return (
    <div>
      <PageHeader
        title="Products"
        description={`${products.length} products in catalog`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add Product
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by title or ID"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as "title" | "price" | "stock")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Sort: Title</SelectItem>
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
                <th className="p-3">Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border/60 last:border-b-0 hover:bg-secondary/30"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {/* Images are optional now — a product can genuinely
                          have none. Falls back to the same placeholder used
                          elsewhere in the admin rather than an empty <img>
                          src, which renders as a broken-image icon. */}
                      <img
                        src={p.images[p.mainImageIndex ?? 0] ?? p.images[0] ?? placeholderImg}
                        alt=""
                        className="size-12 object-cover rounded"
                      />
                      <div>
                        <div className="font-medium flex items-center gap-1">
                          {p.title}
                          {p.featured && <Star className="size-3 text-primary fill-primary" />}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{p.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="capitalize">{p.category}</td>
                  <td>
                    ${p.price}
                    {p.discount > 0 && (
                      <span className="text-xs text-primary ml-1">-{p.discount}%</span>
                    )}
                  </td>
                  <td>
                    <Badge
                      variant={
                        p.stock === 0 ? "destructive" : p.stock <= 5 ? "secondary" : "outline"
                      }
                    >
                      {p.stock}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={p.published ? "default" : "secondary"}>
                      {p.published ? "Published" : "Draft"}
                    </Badge>
                  </td>
                  <td className="text-right pr-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        // remove() reports its own success/failure once the
                        // request resolves.
                        if (confirm(`Delete ${p.title}?`)) productsService.remove(p.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No products match
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(editing || creating) && (
        <ProductEditor
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

function ProductEditor({
  initial,
  onClose,
}: {
  initial: AdminProduct | null;
  onClose: () => void;
}) {
  const isNew = !initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  // "" means no category selected — never auto-assigned. An existing
  // uncategorised product (category "") starts blank here too, rather than
  // silently landing on the first item in CATEGORIES.
  const [category, setCategory] = useState<Category | "">(initial?.category ?? "");
  // Price/Discount/Stock are optional: "" is a real, distinct state (the
  // field left blank), not a stand-in for 0. A brand-new product starts
  // blank; editing an existing one shows its real value, including 0.
  const [price, setPrice] = useState<number | "">(initial?.price ?? "");
  const [discount, setDiscount] = useState<number | "">(initial?.discount ?? "");
  const [stock, setStock] = useState<number | "">(initial?.stock ?? "");
  const [sizes, setSizes] = useState((initial?.sizes ?? []).join(", "));
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [mainImageIndex, setMainImageIndex] = useState(initial?.mainImageIndex ?? 0);
  const [featured, setFeatured] = useState(!!initial?.featured);
  const [published, setPublished] = useState(initial?.published ?? true);
  // Model height/wearing size are optional — a new product starts blank
  // rather than pre-filled with an invented "170 cm" / "M".
  const [modelHeight, setModelHeight] = useState(initial?.model.height ?? "");
  const [modelWearing, setModelWearing] = useState(initial?.model.wearingSize ?? "");
  // Measurements are optional too — a new product starts with an empty
  // field rather than four pre-filled "Label: " lines.
  const [measurements, setMeasurements] = useState(
    Object.entries(initial?.measurements ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
  );

  function addImageUrl() {
    const url = window.prompt("Image URL (or data URL)");
    if (url) setImages((prev) => [...prev, url]);
  }
  async function addImageFile(file: File) {
    // Uploaded to storage first; the product stores the returned URL, the same
    // shape as a pasted one.
    try {
      const url = await uploadProductImage(file);
      setImages((prev) => [...prev, url]);
    } catch (error) {
      toast.error(errorMessage(error, "Could not upload the image"));
    }
  }
  function moveImage(idx: number, dir: -1 | 1) {
    const swap = idx + dir;
    if (swap < 0 || swap >= images.length) return;
    const next = images.slice();
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setImages(next);
    if (mainImageIndex === idx) setMainImageIndex(swap);
    else if (mainImageIndex === swap) setMainImageIndex(idx);
  }

  function save() {
    // Every field here is optional — title included. An empty form is a
    // valid product; the API supplies the same safe defaults ('' / 0 / no
    // category) it already uses for every other optional column.
    const meas: Record<string, string> = {};
    for (const line of measurements.split("\n")) {
      const [k, ...rest] = line.split(":");
      if (k && rest.length) meas[k.trim()] = rest.join(":").trim();
    }
    const payload = {
      title: title.trim(),
      description,
      category,
      // Left as `number | ""` on purpose — Number("") is 0, which would
      // silently turn "left blank" into "priced at zero" right here.
      // toApiPayload() (products-admin.ts) is what decides a blank field
      // means "omit", not this form.
      price,
      discount,
      stock,
      rating: initial?.rating ?? 5,
      reviewCount: initial?.reviewCount ?? 0,
      // No uploaded images is a valid product now — nothing stands in for
      // a real photo.
      images,
      sizes: sizes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      measurements: meas,
      model: {
        height: modelHeight,
        weight: initial?.model.weight ?? "",
        wearingSize: modelWearing,
      },
      isNew: initial?.isNew,
      isBestSeller: initial?.isBestSeller,
      hasGift: initial?.hasGift,
      featured,
      published,
      mainImageIndex,
    };
    // The service reports success or failure itself once the request resolves.
    // Announcing success here too would claim the save worked even when the
    // API rejected it.
    if (isNew) productsService.create(payload as never);
    else productsService.update(initial!.id, payload as never);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New Product" : `Edit — ${initial?.title}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
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
            <Label>Category</Label>
            <Select
              value={category || NO_CATEGORY}
              onValueChange={(v) => setCategory(v === NO_CATEGORY ? "" : (v as Category))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sizes (comma-separated)</Label>
            <Input
              value={sizes}
              onChange={(e) => setSizes(e.target.value)}
              placeholder="XS, S, M, L, XL"
            />
          </div>
          <div>
            <Label>Price ($)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              placeholder="Not set"
              value={price}
              onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
              className={NUMBER_INPUT_CLASS}
            />
          </div>
          <div>
            <Label>Discount (%)</Label>
            <Input
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              max={100}
              placeholder="Not set"
              value={discount}
              onChange={(e) => setDiscount(e.target.value === "" ? "" : Number(e.target.value))}
              className={NUMBER_INPUT_CLASS}
            />
          </div>
          <div>
            <Label>Stock</Label>
            <Input
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              placeholder="Not set"
              value={stock}
              onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
              className={NUMBER_INPUT_CLASS}
            />
          </div>
          <div>
            <Label>Status</Label>
            <div className="flex items-center gap-4 h-10">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={published} onCheckedChange={setPublished} />
                Published
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={featured} onCheckedChange={setFeatured} />
                Featured
              </label>
            </div>
          </div>
          <div>
            <Label>Model height</Label>
            <Input value={modelHeight} onChange={(e) => setModelHeight(e.target.value)} />
          </div>
          <div>
            <Label>Model wearing size</Label>
            <Input value={modelWearing} onChange={(e) => setModelWearing(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Measurements (one per line, "Name: value")</Label>
            <Textarea
              value={measurements}
              onChange={(e) => setMeasurements(e.target.value)}
              rows={4}
            />
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <Label>Images</Label>
              <div className="flex gap-2">
                <label className="text-xs px-3 py-1.5 border border-border rounded cursor-pointer hover:bg-secondary">
                  Upload
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
                  className={`relative border rounded overflow-hidden ${mainImageIndex === i ? "ring-2 ring-primary" : "border-border"}`}
                >
                  {/* Same 3:4 frame and centred cover the storefront product
                      card uses, so this preview shows the crop that will
                      actually ship. The old `h-24` box was a wide landscape
                      frame, which for a landscape upload showed nearly the
                      whole photo while the card discarded half its width —
                      the reason an image could look right here and wrong on
                      the shop page. */}
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
                  <button
                    className="absolute bottom-1 left-1 right-1 text-[10px] bg-background/80 py-0.5 hover:bg-primary hover:text-primary-foreground"
                    onClick={() => setMainImageIndex(i)}
                  >
                    {mainImageIndex === i ? "Main image" : "Set as main"}
                  </button>
                </div>
              ))}
              {images.length === 0 && (
                <p className="col-span-4 text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded">
                  No images yet
                </p>
              )}
            </div>
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
