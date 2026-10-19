import { createFileRoute } from "@tanstack/react-router";
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

function PageEditor({ slug }: { slug: string }) {
  const { data: page, isPending } = useCmsPage(slug);

  if (isPending || !page) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <SeoCard page={page} />
      {page.sections
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
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

/**
 * One editable block. Only the fields a section type actually uses are shown,
 * so a product row doesn't offer an image field it would ignore.
 */
function SectionCard({ section }: { section: SiteSection }) {
  const save = useSaveSection();
  const [draft, setDraft] = useState({
    title: section.title ?? "",
    subtitle: section.subtitle ?? "",
    content: section.content ?? "",
    imageUrl: section.imageUrl ?? "",
    buttonText: section.buttonText ?? "",
    buttonUrl: section.buttonUrl ?? "",
    isVisible: section.isVisible,
  });

  const type = section.sectionType;
  const showImage = ["hero", "rich_text"].includes(type);
  const showButton = ["hero", "instagram"].includes(type);
  const showContent = ["hero", "rich_text", "value_card", "newsletter"].includes(type);
  const showSubtitle = ["hero", "rich_text", "testimonials", "instagram"].includes(type);
  const limit = Number(section.settings["limit"] ?? 0);
  const [limitDraft, setLimitDraft] = useState(String(limit || 4));

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-display text-lg">
              {section.title || section.sectionKey.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {section.sectionKey} · {type}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.isVisible}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, isVisible: v }))}
              />
              <span className="text-xs text-muted-foreground">
                {draft.isVisible ? "Visible" : "Hidden"}
              </span>
            </div>
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  id: section.id,
                  patch: {
                    title: draft.title,
                    subtitle: draft.subtitle,
                    content: draft.content,
                    imageUrl: draft.imageUrl,
                    buttonText: draft.buttonText,
                    buttonUrl: draft.buttonUrl,
                    isVisible: draft.isVisible,
                    ...(type === "product_row"
                      ? {
                          settings: {
                            ...section.settings,
                            limit: Number(limitDraft) || 4,
                          },
                        }
                      : {}),
                  },
                })
              }
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </div>
          {showSubtitle && (
            <div className="space-y-1.5">
              <Label className="text-xs">Eyebrow / subtitle</Label>
              <Input
                value={draft.subtitle}
                onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
              />
            </div>
          )}
          {showContent && (
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Description</Label>
              <Textarea
                rows={3}
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              />
            </div>
          )}
          {showImage && (
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Image path</Label>
              <Input
                value={draft.imageUrl}
                placeholder="/images/brand/vielinea-hero.jpg"
                onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))}
              />
              {draft.imageUrl && (
                <img
                  src={draft.imageUrl}
                  alt=""
                  className="mt-2 h-24 w-40 object-cover rounded border border-border"
                />
              )}
            </div>
          )}
          {showButton && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Button text</Label>
                <Input
                  value={draft.buttonText}
                  onChange={(e) => setDraft((d) => ({ ...d, buttonText: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Button URL</Label>
                <Input
                  value={draft.buttonUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, buttonUrl: e.target.value }))}
                />
              </div>
            </>
          )}
          {type === "product_row" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Products to show</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Products come from the catalogue ({String(section.settings["source"] ?? "manual")}).
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
