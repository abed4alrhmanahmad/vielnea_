import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Twitter } from "lucide-react";
import { Logo } from "./logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/services/site-content";
import { useNewsletterMutation } from "@/services/contact";

/** Splits a CMS href into a route + search params for typed navigation. */
function parseHref(href: string): { to: string; search?: Record<string, string> } {
  const [path, query] = href.split("?");
  const to = path || "/";
  if (!query) return { to };
  const search: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) search[key] = value;
  return { to, search };
}

export function Footer() {
  const site = useSiteSettings();
  const newsletter = useNewsletterMutation();

  return (
    <footer className="mt-24 border-t border-border bg-secondary/40">
      <div className="container-luxe py-16 grid gap-12 md:grid-cols-4">
        <div>
          <Logo loading="lazy" />
          <p className="mt-6 text-sm text-muted-foreground leading-relaxed">
            {site.footer.tagline}
          </p>
          <div className="mt-6 flex gap-3 text-primary">
            <a
              href={site.social.instagram || "#"}
              aria-label="Instagram"
              className="hover:text-primary-dark"
            >
              <Instagram className="size-4" />
            </a>
            <a
              href={site.social.facebook || "#"}
              aria-label="Facebook"
              className="hover:text-primary-dark"
            >
              <Facebook className="size-4" />
            </a>
            <a
              href={site.social.twitter || "#"}
              aria-label="Twitter"
              className="hover:text-primary-dark"
            >
              <Twitter className="size-4" />
            </a>
          </div>
        </div>

        {/* Link columns are CMS-managed: headings, labels, order and targets. */}
        {site.footer.columns.map((column) => (
          <div key={column.heading}>
            <h4 className="font-display text-primary text-base mb-4">{column.heading}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {column.links.map((link) => {
                const { to, search } = parseHref(link.href);
                // External or placeholder targets stay plain anchors.
                const isRoute = link.href.startsWith("/");
                return (
                  <li key={`${column.heading}-${link.label}`}>
                    {isRoute ? (
                      <Link to={to} search={search as never} className="hover:text-primary">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href || "#"} className="hover:text-primary">
                        {link.label}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {site.newsletter.enabled && (
          <div>
            <h4 className="font-display text-primary text-base mb-4">{site.newsletter.title}</h4>
            <p className="text-sm text-muted-foreground mb-3">{site.newsletter.body}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const email = new FormData(form).get("email");
                if (typeof email !== "string" || !email) return;
                // Persisted to newsletter_subscribers via the API. Previously this
                // form showed a success toast without saving anything.
                newsletter.mutate({ email, source: "footer" }, { onSuccess: () => form.reset() });
              }}
              className="flex gap-2"
            >
              <Input
                name="email"
                type="email"
                required
                placeholder="Your email"
                className="bg-background"
              />
              <Button type="submit" disabled={newsletter.isPending}>
                {newsletter.isPending ? "…" : "Join"}
              </Button>
            </form>
          </div>
        )}
      </div>
      <div className="border-t border-border">
        <div className="container-luxe py-6 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{site.footer.copyright}</span>
          <span className="tracking-[0.2em] uppercase">{site.footer.legal}</span>
        </div>
      </div>
    </footer>
  );
}
