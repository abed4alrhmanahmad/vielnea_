/**
 * Admin → Homepage editor for the "featured_categories" section — the row of
 * category image cards under the hero (Blazers / Vests / Accessories).
 *
 * Everything is stored in the section's own `settings`, saved through the same
 * PUT /admin/site/sections/:id as every other homepage section:
 *
 *   categories  ordered category slugs — which cards appear, in what order
 *   labels      slug -> card title override
 *   images      slug -> card image override
 *   hrefs       slug -> card link override
 *   hidden      slugs kept in the list but not shown
 *
 * An empty override means "use the category's own" name, image or link, so a
 * category edited under Admin → Categories keeps flowing through to its card.
 * The section's Visible switch turns the whole row on or off.
 */
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSaveSection, type SiteSection } from "@/admin/services/cms";
import { useCategories, type AdminCategory } from "@/admin/services/categories";
import { UPLOAD_ACCEPT_ATTRIBUTE, uploadProductImage } from "@/admin/services/products-admin";
import { errorMessage } from "@/lib/api/client";

interface CardDraft {
  key: string;
  label: string;
  imageUrl: string;
  href: string;
  visible: boolean;
}

type Overrides = Record<string, string>;

/** The link a card opens when no override is set — mirrors the homepage. */
function defaultHref(key: string): string {
  return `/shop?cat=${key}`;
}

function draftsFrom(section: SiteSection): CardDraft[] {
  const s = section.settings;
  const keys = (s["categories"] as string[] | undefined) ?? [];
  const labels = (s["labels"] as Overrides | undefined) ?? {};
  const images = (s["images"] as Overrides | undefined) ?? {};
  const hrefs = (s["hrefs"] as Overrides | undefined) ?? {};
  const hidden = (s["hidden"] as string[] | undefined) ?? [];
  return keys.map((key) => ({
    key,
    label: labels[key] ?? "",
    imageUrl: images[key] ?? "",
    href: hrefs[key] ?? "",
    visible: !hidden.includes(key),
  }));
}

export function FeaturedCategoriesEditor({ section }: { section: SiteSection }) {
  const save = useSaveSection();
  const categories = useCategories();
  const [cards, setCards] = useState<CardDraft[]>(() => draftsFrom(section));
  const [sectionVisible, setSectionVisible] = useState(section.isVisible);
  const [toAdd, setToAdd] = useState("");

  const byKey = new Map(categories.map((c) => [c.key, c]));
  const available = categories.filter((c) => !cards.some((card) => card.key === c.key));

  const update = (index: number, patch: Partial<CardDraft>) =>
    setCards((list) => list.map((card, i) => (i === index ? { ...card, ...patch } : card)));

  const move = (index: number, by: -1 | 1) =>
    setCards((list) => {
      const next = list.slice();
      const target = index + by;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  function addCard() {
    if (!toAdd) return;
    setCards((list) => [...list, { key: toAdd, label: "", imageUrl: "", href: "", visible: true }]);
    setToAdd("");
  }

  function onSave() {
    const badLink = cards.find((c) => c.href.trim() && !c.href.trim().startsWith("/"));
    if (badLink) {
      toast.error(`Links must be a page on this site, starting with "/" (${badLink.key})`);
      return;
    }
    // Only non-empty overrides are stored; an empty one falls back to the category.
    const pick = (field: "label" | "imageUrl" | "href"): Overrides =>
      Object.fromEntries(cards.filter((c) => c[field].trim()).map((c) => [c.key, c[field].trim()]));
    save.mutate({
      id: section.id,
      patch: {
        isVisible: sectionVisible,
        settings: {
          ...section.settings,
          categories: cards.map((c) => c.key),
          labels: pick("label"),
          images: pick("imageUrl"),
          hrefs: pick("href"),
          hidden: cards.filter((c) => !c.visible).map((c) => c.key),
        },
      },
    });
  }

  return (
    <Card id="featured-categories">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-display text-lg">Featured categories</p>
            <p className="text-xs text-muted-foreground">
              The category image cards under the hero. Leave a title, image or link empty to use the
              category's own.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={sectionVisible} onCheckedChange={setSectionVisible} />
              <span className="text-xs text-muted-foreground">
                {sectionVisible ? "Section visible" : "Section hidden"}
              </span>
            </div>
            <Button size="sm" disabled={save.isPending} onClick={onSave}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {cards.length === 0 && (
          <p className="text-sm text-muted-foreground">No cards. Add a category below.</p>
        )}

        <div className="space-y-3">
          {cards.map((card, index) => (
            <CardRow
              key={card.key}
              card={card}
              category={byKey.get(card.key)}
              isFirst={index === 0}
              isLast={index === cards.length - 1}
              onChange={(patch) => update(index, patch)}
              onMove={(by) => move(index, by)}
              onRemove={() => setCards((list) => list.filter((_, i) => i !== index))}
            />
          ))}
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1.5">
            <Label className="text-xs">Add a category card</Label>
            <select
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm min-w-48"
            >
              <option value="">Choose a category…</option>
              {available.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!toAdd} onClick={addCard}>
            <Plus className="size-4" /> Add card
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CardRow({
  card,
  category,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  card: CardDraft;
  category: AdminCategory | undefined;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<CardDraft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = card.imageUrl || category?.imageUrl || "";

  /** Same upload endpoint and bucket the product and hero images use. */
  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      onChange({ imageUrl: await uploadProductImage(file) });
      toast.success("Image uploaded — press Save to publish it");
    } catch (error) {
      toast.error(errorMessage(error, "Could not upload the image"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className={`rounded-md border border-border p-3 flex gap-4 flex-col sm:flex-row ${card.visible ? "" : "opacity-60"}`}
    >
      <div className="shrink-0">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="h-28 w-[90px] object-cover rounded border border-border"
          />
        ) : (
          <div className="h-28 w-[90px] rounded border border-dashed border-border" />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-medium">
            {category?.label ?? card.key}
            {!category && (
              <span className="ml-2 text-xs text-destructive">
                category not found — this card is not shown
              </span>
            )}
          </p>
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-2 mr-2">
              <Switch checked={card.visible} onCheckedChange={(v) => onChange({ visible: v })} />
              <span className="text-xs text-muted-foreground">
                {card.visible ? "Shown" : "Hidden"}
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              disabled={isFirst}
              onClick={() => onMove(-1)}
              aria-label="Move up"
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={isLast}
              onClick={() => onMove(1)}
              aria-label="Move down"
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Remove card">
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Card title</Label>
            <Input
              value={card.label}
              placeholder={category?.label ?? ""}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Link</Label>
            <Input
              value={card.href}
              placeholder={defaultHref(card.key)}
              onChange={(e) => onChange({ href: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Image</Label>
            <div className="flex gap-2">
              <Input
                value={card.imageUrl}
                placeholder="Category image (default) — or paste a URL / upload"
                onChange={(e) => onChange({ imageUrl: e.target.value })}
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
              {card.imageUrl && (
                <Button type="button" variant="ghost" onClick={() => onChange({ imageUrl: "" })}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
