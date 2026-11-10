import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCmsPage,
  useSavePageSeo,
  useSaveSection,
  type SitePage,
  type SiteSection,
} from "@/admin/services/cms";
import { FeaturedCategoriesEditor } from "@/admin/components/featured-categories-editor";
import { changedFields } from "@/admin/lib/changed-fields";
import { toast } from "sonner";

export const Route = createFileRoute("/_adminGuard/admin/homepage")({
  head: () => ({
    meta: [{ title: "Pages — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: PagesPage,
});

const PAGES = [
  { slug: "home", label: "Homepage" },
  { slug: "about", label: "About Us" },
  { slug: "contact", label: "Contact" },
] as const;

function PagesPage() {
  const [slug, setSlug] = useState<string>("home");

  return (
    <div>
      <PageHeader
        title="Pages"
        description="Edit page sections and SEO. Saved to the database and live immediately."
        actions={
          <Button variant="outline" asChild>
            <a href={slug === "home" ? "/" : `/${slug}`} target="_blank" rel="noreferrer">
              Preview
            </a>
          </Button>
        }
      />

      <Tabs value={slug} onValueChange={setSlug}>
        <TabsList className="mb-4">
          {PAGES.map((p) => (
            <TabsTrigger key={p.slug} value={p.slug}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {PAGES.map((p) => (
          <TabsContent key={p.slug} value={p.slug}>
            <PageEditor slug={p.slug} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * Sections that belong to a page with its own admin screen. They are left out
 * of this editor so each has exactly one place where it is managed:
 *
 *   hero      the storefront hero is the Hero Slides carousel; the old CMS
 *             `hero` row is no longer read by the homepage at all.
 *   timeline  heading, description and on/off switch are edited under
 *             Company Timeline, which writes this same row.
 */
const MANAGED_ELSEWHERE: Record<string, { what: string; to: string; page: string }> = {
  hero: { what: "Homepage hero", to: "/admin/hero-slides", page: "Hero Slides" },
  timeline: { what: "Company timeline", to: "/admin/timeline", page: "Company Timeline" },
};

function PageEditor({ slug }: { slug: string }) {
  const { data: page, isPending } = useCmsPage(slug);

  if (isPending || !page) return <Skeleton className="h-96 w-full" />;

  const sections = page.sections.slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const elsewhere = sections.filter((s) => MANAGED_ELSEWHERE[s.sectionType]);

  return (
    <div className="space-y-4">
      <SeoCard page={page} />
      {sections
        .filter((s) => !MANAGED_ELSEWHERE[s.sectionType])
        .map((section) =>
          section.sectionType === "featured_categories" ? (
            <FeaturedCategoriesEditor key={section.id} section={section} />
          ) : (
            <SectionCard key={section.id} section={section} />
          ),
        )}
      {elsewhere.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-1 text-sm text-muted-foreground">
            {elsewhere.map((s) => {
              const owner = MANAGED_ELSEWHERE[s.sectionType]!;
              return (
                <p key={s.id}>
                  {owner.what} is managed under{" "}
                  <Link to={owner.to} className="text-primary hover:underline">
                    {owner.page}
                  </Link>
                  .
                </p>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SeoCard({ page }: { page: SitePage }) {
  const save = useSavePageSeo();
  const [draft, setDraft] = useState({
    metaTitle: page.metaTitle ?? "",
    metaDescription: page.metaDescription ?? "",
    ogTitle: page.ogTitle ?? "",
    ogDescription: page.ogDescription ?? "",
    ogImage: page.ogImage ?? "",
  });

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">SEO</p>
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate({ id: page.id, patch: draft })}
          >
            {save.isPending ? "Saving…" : "Save SEO"}
          </Button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Meta title</Label>
            <Input
              value={draft.metaTitle}
              onChange={(e) => setDraft((d) => ({ ...d, metaTitle: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Open Graph title</Label>
            <Input
              value={draft.ogTitle}
              onChange={(e) => setDraft((d) => ({ ...d, ogTitle: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Meta description</Label>
            <Textarea
              rows={2}
              value={draft.metaDescription}
              onChange={(e) => setDraft((d) => ({ ...d, metaDescription: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Open Graph description</Label>
            <Textarea
              rows={2}
              value={draft.ogDescription}
              onChange={(e) => setDraft((d) => ({ ...d, ogDescription: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Open Graph image</Label>
            <Input
              value={draft.ogImage}
              placeholder="/images/brand/vielinea-hero.jpg"
              onChange={(e) => setDraft((d) => ({ ...d, ogImage: e.target.value }))}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type SectionField = "title" | "subtitle" | "content" | "imageUrl" | "buttonText";

/**
 * The fields each section type actually renders on the storefront. A field is
 * offered only when changing it changes the page, so nothing here is a dead
 * input. Copy that lives in a dedicated screen is pointed to instead.
 */
const SECTION_FIELDS: Record<string, SectionField[]> = {
  rich_text: ["title", "subtitle", "content", "imageUrl"],
  value_card: ["title", "content"],
  product_row: ["title"],
  testimonials: ["title", "subtitle"],
  instagram: ["title", "subtitle", "buttonText"],
  // Heading and description are Site Content → Contact → Newsletter block.
  newsletter: [],
};

const FIELD_LABELS: Record<SectionField, string> = {
  title: "Title",
  subtitle: "Eyebrow / subtitle",
  content: "Description",
  imageUrl: "Image path",
  buttonText: "Link text",
};

/** Where a product row's products come from — the flags are set in Products. */
function productRowSource(settings: Record<string, unknown>): string {
  const category = String(settings["category"] ?? "");
  switch (String(settings["source"] ?? "")) {
    case "newArrival":
      return "Published products switched to “New arrival” under Products.";
    case "bestSeller":
      return "Published products flagged as best sellers. Products has no switch for this flag yet.";
    case "featured":
      return "Published products switched to “Featured” under Products.";
    case "gift":
      return "Published products that include a gift option.";
    case "category":
      return `Published products in the “${category}” category under Products.`;
    case "accessories":
      return "Items from Admin → Accessories (a separate catalogue from Products).";
    default:
      return "Products chosen by id.";
  }
}

/** Short help for a section whose content is managed on another screen. */
function SectionNote({ section }: { section: SiteSection }) {
  const muted = "text-xs text-muted-foreground";
  switch (section.sectionType) {
    case "testimonials":
      return (
        <p className={muted}>
          The quotes are managed under{" "}
          <Link to="/admin/content" className="text-primary hover:underline">
            Site Content → Testimonials
          </Link>
          . Hiding this section hides the whole testimonials band.
        </p>
      );
    case "instagram":
      return (
        <p className={muted}>
          The images are managed under{" "}
          <Link to="/admin/selected-images" className="text-primary hover:underline">
            Selected Images
          </Link>
          ; the link opens the Instagram URL set under Site Content → Footer. Hiding this section
          hides the whole strip.
        </p>
      );
    case "newsletter":
      return (
        <p className={muted}>
          Shows or hides the homepage newsletter band. Its heading and description, and the footer
          block's own switch, are under{" "}
          <Link to="/admin/content" className="text-primary hover:underline">
            Site Content → Contact
          </Link>
          .
        </p>
      );
    case "product_row": {
      const pinned = (section.settings["productIds"] as string[] | undefined) ?? [];
      return (
        <p className={muted}>
          Products: {productRowSource(section.settings)} This row only sets the title, how many
          appear, and whether it is shown.
          {pinned.length > 0 &&
            ` It is currently pinned to ${pinned.length} specific product(s), which take the place of the source above.`}
        </p>
      );
    }
    default:
      return null;
  }
}

type SectionDraft = Partial<Record<SectionField, string>> & { isVisible: boolean; limit?: string };

function draftFrom(section: SiteSection): SectionDraft {
  const draft: SectionDraft = { isVisible: section.isVisible };
  for (const field of SECTION_FIELDS[section.sectionType] ?? ["title"]) {
    draft[field] = section[field] ?? "";
  }
  if (section.sectionType === "product_row") {
    draft.limit = String(Number(section.settings["limit"] ?? 0) || 4);
  }
  return draft;
}

/**
 * One editable block. Only the fields a section type actually uses are shown,
 * and Save sends only the fields changed since the last save — so this card
 * never writes back a value it merely loaded.
 */
function SectionCard({ section }: { section: SiteSection }) {
  const save = useSaveSection();
  const fields = SECTION_FIELDS[section.sectionType] ?? ["title"];
  const [saved, setSaved] = useState<SectionDraft>(() => draftFrom(section));
  const [draft, setDraft] = useState<SectionDraft>(saved);
  const set = (patch: Partial<SectionDraft>) => setDraft((d) => ({ ...d, ...patch }));

  function onSave() {
    const changed = changedFields(saved, draft);
    if (Object.keys(changed).length === 0) {
      toast("No changes to save");
      return;
    }
    const { limit, ...columns } = changed;
    const patch: Partial<SiteSection> = { ...columns };
    if (limit !== undefined) {
      patch.settings = { ...section.settings, limit: Number(limit) || 4 };
    }
    const next = draft;
    save.mutate({ id: section.id, patch }, { onSuccess: () => setSaved(next) });
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-display text-lg">
              {section.title || section.sectionKey.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {section.sectionKey} · {section.sectionType}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.isVisible}
                onCheckedChange={(v) => set({ isVisible: v })}
                aria-label={`Show ${section.sectionKey} section`}
              />
              <span className="text-xs text-muted-foreground">
                {draft.isVisible ? "Visible" : "Hidden"}
              </span>
            </div>
            <Button size="sm" disabled={save.isPending} onClick={onSave}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <SectionNote section={section} />

        {(fields.length > 0 || section.sectionType === "product_row") && (
          <div className="grid md:grid-cols-2 gap-4">
            {fields.map((field) => {
              const wide = field === "content" || field === "imageUrl";
              const value = draft[field] ?? "";
              return (
                <div key={field} className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}>
                  <Label className="text-xs">{FIELD_LABELS[field]}</Label>
                  {field === "content" ? (
                    <Textarea
                      rows={3}
                      value={value}
                      onChange={(e) => set({ content: e.target.value })}
                    />
                  ) : (
                    <Input
                      value={value}
                      placeholder={field === "imageUrl" ? "/images/brand/vielinea-hero.jpg" : ""}
                      onChange={(e) => set({ [field]: e.target.value })}
                    />
                  )}
                  {field === "imageUrl" && value && (
                    <img
                      src={value}
                      alt=""
                      className="mt-2 h-24 w-40 object-cover rounded border border-border"
                    />
                  )}
                </div>
              );
            })}
            {section.sectionType === "product_row" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Products to show</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={draft.limit ?? "4"}
                  onChange={(e) => set({ limit: e.target.value })}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
