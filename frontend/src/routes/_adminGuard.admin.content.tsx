import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  useCmsSettings,
  useCmsTestimonials,
  useSaveSettingGroup,
  useSaveStoreSettings,
  useTestimonialMutations,
  type AdminSiteSettings,
  type Testimonial,
} from "@/admin/services/cms";

export const Route = createFileRoute("/_adminGuard/admin/content")({
  head: () => ({
    meta: [{ title: "Website Content — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: ContentPage,
});

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ContentPage() {
  const { data, isPending } = useCmsSettings();
  const saveGroup = useSaveSettingGroup();
  const saveStore = useSaveStoreSettings();

  const [draft, setDraft] = useState<AdminSiteSettings | null>(null);
  useEffect(() => {
    if (data) setDraft(structuredClone(data));
  }, [data]);

  if (isPending || !draft) {
    return (
      <div>
        <PageHeader title="Website Content" description="Loading content from the database…" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const patch = <K extends keyof AdminSiteSettings>(key: K, value: Partial<AdminSiteSettings[K]>) =>
    setDraft((prev) => (prev ? { ...prev, [key]: { ...prev[key], ...value } } : prev));

  const saveAll = () => {
    // Each group is a document in site_content; the store row is separate.
    for (const key of [
      "announcement",
      "header",
      "footer",
      "social",
      "contact",
      "newsletter",
    ] as const) {
      saveGroup.mutate({ key, value: draft[key] });
    }
    saveStore.mutate(draft.store);
  };

  return (
    <div>
      <PageHeader
        title="Website Content"
        description="Edit the storefront's content. Saved to the database and live immediately."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/" target="_blank" rel="noreferrer">
                Preview
              </a>
            </Button>
            <Button onClick={saveAll} disabled={saveGroup.isPending || saveStore.isPending}>
              {saveGroup.isPending || saveStore.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      />

      <Tabs defaultValue="announcement">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="announcement">Announcement</TabsTrigger>
          <TabsTrigger value="navbar">Navbar</TabsTrigger>
          <TabsTrigger value="footer">Footer</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          <TabsTrigger value="store">Store</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------- announcement */}
        <TabsContent value="announcement">
          <Card>
            <CardContent className="pt-6 space-y-4 max-w-2xl">
              <div className="flex items-center gap-3">
                <Switch
                  checked={draft.announcement.enabled}
                  onCheckedChange={(v) => patch("announcement", { enabled: v })}
                />
                <span className="text-sm">Show the announcement bar</span>
              </div>
              <Field label="Announcement text">
                <Input
                  value={draft.announcement.text}
                  onChange={(e) => patch("announcement", { text: e.target.value })}
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --------------------------------------------------------- navbar */}
        <TabsContent value="navbar">
          <Card>
            <CardContent className="pt-6 space-y-3 max-w-3xl">
              <p className="text-xs text-muted-foreground">
                Labels, order and visibility of the main navigation. Search, cart, wishlist and
                account controls are fixed UI and stay in code.
              </p>
              {draft.header.nav.map((item, i) => (
                <div key={i} className="flex items-end gap-2 border border-border rounded p-3">
                  <div className="flex-1">
                    <Field label="Label">
                      <Input
                        value={item.label}
                        onChange={(e) => {
                          const nav = [...draft.header.nav];
                          nav[i] = { ...item, label: e.target.value };
                          patch("header", { nav });
                        }}
                      />
                    </Field>
                  </div>
                  <div className="flex-1">
                    <Field label="Link">
                      <Input
                        value={item.href}
                        onChange={(e) => {
                          const nav = [...draft.header.nav];
                          nav[i] = { ...item, href: e.target.value };
                          patch("header", { nav });
                        }}
                      />
                    </Field>
                  </div>
                  <div className="flex items-center gap-1 pb-2">
                    <Switch
                      checked={item.enabled}
                      onCheckedChange={(v) => {
                        const nav = [...draft.header.nav];
                        nav[i] = { ...item, enabled: v };
                        patch("header", { nav });
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={i === 0}
                      onClick={() => {
                        const nav = [...draft.header.nav];
                        [nav[i - 1], nav[i]] = [nav[i]!, nav[i - 1]!];
                        patch("header", { nav });
                      }}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={i === draft.header.nav.length - 1}
                      onClick={() => {
                        const nav = [...draft.header.nav];
                        [nav[i + 1], nav[i]] = [nav[i]!, nav[i + 1]!];
                        patch("header", { nav });
                      }}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        patch("header", { nav: draft.header.nav.filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patch("header", {
                    nav: [...draft.header.nav, { label: "New link", href: "/", enabled: true }],
                  })
                }
              >
                <Plus className="size-3.5" /> Add navigation item
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --------------------------------------------------------- footer */}
        <TabsContent value="footer">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <Field label="Footer description">
                  <Textarea
                    rows={3}
                    value={draft.footer.tagline}
                    onChange={(e) => patch("footer", { tagline: e.target.value })}
                  />
                </Field>
                <Field label="Copyright">
                  <Input
                    value={draft.footer.copyright}
                    onChange={(e) => patch("footer", { copyright: e.target.value })}
                  />
                </Field>
                <Field label="Legal line">
                  <Input
                    value={draft.footer.legal}
                    onChange={(e) => patch("footer", { legal: e.target.value })}
                  />
                </Field>
                <Field label="Instagram URL">
                  <Input
                    value={draft.social.instagram}
                    onChange={(e) => patch("social", { instagram: e.target.value })}
                  />
                </Field>
                <Field label="Facebook URL">
                  <Input
                    value={draft.social.facebook}
                    onChange={(e) => patch("social", { facebook: e.target.value })}
                  />
                </Field>
                <Field label="Twitter URL">
                  <Input
                    value={draft.social.twitter}
                    onChange={(e) => patch("social", { twitter: e.target.value })}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  Link columns
                </p>
                {draft.footer.columns.map((column, ci) => (
                  <div key={ci} className="border border-border rounded p-3 space-y-2">
                    <Field label="Column heading">
                      <Input
                        value={column.heading}
                        onChange={(e) => {
                          const columns = structuredClone(draft.footer.columns);
                          columns[ci]!.heading = e.target.value;
                          patch("footer", { columns });
                        }}
                      />
                    </Field>
                    {column.links.map((link, li) => (
                      <div key={li} className="flex gap-2 items-center">
                        <Input
                          value={link.label}
                          placeholder="Label"
                          onChange={(e) => {
                            const columns = structuredClone(draft.footer.columns);
                            columns[ci]!.links[li]!.label = e.target.value;
                            patch("footer", { columns });
                          }}
                        />
                        <Input
                          value={link.href}
                          placeholder="/path"
                          onChange={(e) => {
                            const columns = structuredClone(draft.footer.columns);
                            columns[ci]!.links[li]!.href = e.target.value;
                            patch("footer", { columns });
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const columns = structuredClone(draft.footer.columns);
                            columns[ci]!.links.splice(li, 1);
                            patch("footer", { columns });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const columns = structuredClone(draft.footer.columns);
                        columns[ci]!.links.push({ label: "New link", href: "/" });
                        patch("footer", { columns });
                      }}
                    >
                      <Plus className="size-3.5" /> Add link
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* -------------------------------------------------------- contact */}
        <TabsContent value="contact">
          <Card>
            <CardContent className="pt-6 space-y-4 max-w-2xl">
              <Field label="Email">
                <Input
                  value={draft.contact.email}
                  onChange={(e) => patch("contact", { email: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={draft.contact.phone}
                  onChange={(e) => patch("contact", { phone: e.target.value })}
                />
              </Field>
              <Field label="Address">
                <Textarea
                  rows={2}
                  value={draft.contact.address}
                  onChange={(e) => patch("contact", { address: e.target.value })}
                />
              </Field>
              <Field label="Working hours">
                <Input
                  value={draft.contact.hours}
                  onChange={(e) => patch("contact", { hours: e.target.value })}
                />
              </Field>
              <div className="border-t border-border pt-4 space-y-4">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  Newsletter block
                </p>
                <Field label="Heading">
                  <Input
                    value={draft.newsletter.title}
                    onChange={(e) => patch("newsletter", { title: e.target.value })}
                  />
                </Field>
                <Field label="Description">
                  <Textarea
                    rows={2}
                    value={draft.newsletter.body}
                    onChange={(e) => patch("newsletter", { body: e.target.value })}
                  />
                </Field>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={draft.newsletter.enabled}
                    onCheckedChange={(v) => patch("newsletter", { enabled: v })}
                  />
                  <span className="text-sm">Show the newsletter block</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testimonials">
          <TestimonialsEditor />
        </TabsContent>

        {/* ---------------------------------------------------------- store */}
        <TabsContent value="store">
          <Card>
            <CardContent className="pt-6 space-y-4 max-w-2xl">
              <p className="text-xs text-muted-foreground">
                Shipping values are used by the cart and checkout on the server.
              </p>
              <Field label="Store name">
                <Input
                  value={draft.store.storeName}
                  onChange={(e) => patch("store", { storeName: e.target.value })}
                />
              </Field>
              <Field label="Standard shipping rate">
                <Input
                  type="number"
                  value={draft.store.standardShipping}
                  onChange={(e) => patch("store", { standardShipping: Number(e.target.value) })}
                />
              </Field>
              <Field label="Currency" hint="Three-letter code, e.g. USD">
                <Input
                  value={draft.store.currency}
                  onChange={(e) => patch("store", { currency: e.target.value.toUpperCase() })}
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------
function TestimonialsEditor() {
  const { data: rows = [], isPending } = useCmsTestimonials();
  const { create, update, remove } = useTestimonialMutations();
  const [draft, setDraft] = useState({ name: "", location: "", quote: "" });

  if (isPending) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
            Add a testimonial
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              placeholder="Author name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <Input
              placeholder="Location"
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
            />
          </div>
          <Textarea
            rows={2}
            placeholder="Quote"
            value={draft.quote}
            onChange={(e) => setDraft((d) => ({ ...d, quote: e.target.value }))}
          />
          <Button
            size="sm"
            disabled={create.isPending || !draft.name || !draft.quote}
            onClick={() =>
              create.mutate(draft, {
                onSuccess: () => setDraft({ name: "", location: "", quote: "" }),
              })
            }
          >
            <Plus className="size-3.5" /> Add testimonial
          </Button>
        </CardContent>
      </Card>

      {rows.map((t: Testimonial) => (
        <Card key={t.id}>
          <CardContent className="pt-6 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                defaultValue={t.name}
                onBlur={(e) =>
                  e.target.value !== t.name &&
                  update.mutate({ id: t.id, patch: { name: e.target.value } })
                }
              />
              <Input
                defaultValue={t.location}
                onBlur={(e) =>
                  e.target.value !== t.location &&
                  update.mutate({ id: t.id, patch: { location: e.target.value } })
                }
              />
            </div>
            <Textarea
              rows={2}
              defaultValue={t.quote}
              onBlur={(e) =>
                e.target.value !== t.quote &&
                update.mutate({ id: t.id, patch: { quote: e.target.value } })
              }
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={t.isActive}
                  onCheckedChange={(v) => update.mutate({ id: t.id, patch: { isActive: v } })}
                />
                <span className="text-xs text-muted-foreground">
                  {t.isActive ? "Visible on the homepage" : "Hidden"}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => remove.mutate(t.id)}>
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
