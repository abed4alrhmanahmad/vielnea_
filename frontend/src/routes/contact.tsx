import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Phone, MapPin } from "lucide-react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  findSection,
  sitePageOptions,
  useSitePage,
  useSiteSettings,
} from "@/services/site-content";
import { useContactMutation } from "@/services/contact";

const schema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  subject: z.string().min(2, "Add a subject"),
  message: z.string().min(10, "Tell us a little more"),
});

export const Route = createFileRoute("/contact")({
  loader: ({ context }) => context.queryClient.ensureQueryData(sitePageOptions("contact")),
  head: () => ({
    meta: [
      { title: "Contact — Vielinea" },
      { name: "description", content: "Get in touch with the Vielinea client care team." },
      { property: "og:title", content: "Contact Vielinea" },
      { property: "og:description", content: "Talk to our client care team." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const site = useSiteSettings();
  const { data: page } = useSitePage("contact");
  const intro = findSection(page, "intro");
  const map = findSection(page, "map");
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const contact = useContactMutation();
  return (
    <Shell>
      <section className="container-luxe py-20 text-center max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.35em] text-primary">{intro?.subtitle}</p>
        <h1 className="font-display text-5xl mt-4">{intro?.title}</h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">{intro?.content}</p>
      </section>

      <section className="container-luxe grid lg:grid-cols-[1fr_420px] gap-10 pb-24">
        <form
          onSubmit={form.handleSubmit(async (values) => {
            // Stored in Supabase via the API; the toast comes from the mutation.
            await contact.mutateAsync(values).then(
              () => form.reset(),
              () => undefined,
            );
          })}
          className="bg-card border border-border p-8 rounded space-y-4"
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" {...form.register("subject")} />
            {form.formState.errors.subject && (
              <p className="text-xs text-destructive mt-1">
                {form.formState.errors.subject.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="message">Message</Label>
            <textarea
              id="message"
              rows={6}
              {...form.register("message")}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {form.formState.errors.message && (
              <p className="text-xs text-destructive mt-1">
                {form.formState.errors.message.message}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="h-11 px-8 uppercase tracking-[0.2em] text-xs"
            disabled={form.formState.isSubmitting || contact.isPending}
          >
            {contact.isPending ? "Sending…" : "Send Message"}
          </Button>
        </form>

        <aside className="space-y-8">
          <div className="bg-card border border-border p-6 rounded space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="size-4 text-primary mt-1" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{site.contact.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="size-4 text-primary mt-1" />
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-sm text-muted-foreground">{site.contact.phone}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="size-4 text-primary mt-1" />
              <div>
                <p className="text-sm font-medium">Atelier</p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {site.contact.address}
                </p>
              </div>
            </div>
          </div>
          <div className="aspect-video bg-secondary rounded flex items-center justify-center text-muted-foreground text-sm border border-border">
            <MapPin className="size-6 text-primary mr-2" /> {map?.title ?? "Map placeholder"}
          </div>
        </aside>
      </section>
    </Shell>
  );
}
