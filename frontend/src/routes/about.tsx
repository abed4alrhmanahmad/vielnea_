import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { FaqAccordion } from "@/components/faq-accordion";
import { heroUrl } from "@/lib/hero-image";
import { IMAGE_SIZES, ResponsiveImage } from "@/components/responsive-image";
import { Award, Leaf, Sparkles, type LucideIcon } from "lucide-react";
import { findSection, sitePageOptions, useSitePage } from "@/services/site-content";
import { CompanyTimeline } from "@/components/about/company-timeline";
import { companyTimelineOptions } from "@/services/company-timeline";
import { faqsOptions, useFaqs } from "@/services/faqs";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/about")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(sitePageOptions("about")),
      context.queryClient.ensureQueryData(companyTimelineOptions()),
      context.queryClient.ensureQueryData(faqsOptions()),
    ]);
  },
  head: () => ({
    meta: [
      { title: "About Vielinea — Timeless Luxury Fashion" },
      {
        name: "description",
        content:
          "The Vielinea story: quiet luxury, considered craft, and pieces designed to endure.",
      },
      { property: "og:title", content: "About Vielinea" },
      { property: "og:description", content: "Quiet luxury, considered craft, made to endure." },
    ],
  }),
  component: AboutPage,
});

/** Icon names are stored in section settings; the components stay in code. */
const ICONS: Record<string, LucideIcon> = { Sparkles, Leaf, Award };

function AboutPage() {
  const { data: page, isPending } = useSitePage("about");
  // The FAQ block below is admin-managed: its heading comes from the database
  // and the whole block disappears when the section is switched off.
  const faq = useFaqs();

  const intro = findSection(page, "intro");
  const craft = findSection(page, "craft");
  // The three value cards, in their CMS display order.
  const valueCards = (page?.sections ?? [])
    .filter((s) => s.sectionType === "value_card")
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <Shell>
      <section className="container-luxe py-20 grid md:grid-cols-2 gap-12 items-center">
        <div>
          {isPending ? (
            <div className="space-y-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-[0.35em] text-primary">
                {intro?.subtitle}
              </p>
              <h1 className="font-display text-5xl mt-4">{intro?.title}</h1>
              <p className="mt-6 text-muted-foreground leading-relaxed whitespace-pre-line">
                {intro?.content}
              </p>
            </>
          )}
        </div>
        <div className="aspect-[3/2] overflow-hidden rounded-lg">
          <ResponsiveImage
            src={intro?.imageUrl || heroUrl}
            alt="Vielinea atelier"
            sizes={IMAGE_SIZES.halfColumn}
            // This is the about page's LCP, so it is fetched with the page.
            fetchPriority="high"
            className="size-full object-cover object-top"
          />
        </div>
      </section>

      {valueCards.length > 0 && (
        <section className="bg-secondary/50 border-y border-border">
          <div className="container-luxe py-20 grid md:grid-cols-3 gap-12">
            {valueCards.map((card) => {
              const iconName = String(card.settings["icon"] ?? "Sparkles");
              const Icon = ICONS[iconName] ?? Sparkles;
              return (
                <div key={card.id} className="text-center">
                  <Icon className="size-8 text-primary mx-auto" />
                  <h3 className="font-display text-2xl mt-4">{card.title}</h3>
                  <p className="mt-3 text-muted-foreground leading-relaxed">{card.content}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {craft && (
        <section className="container-luxe py-20 text-center max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.35em] text-primary">{craft.subtitle}</p>
          <h2 className="font-display text-4xl mt-4">{craft.title}</h2>
          <p className="mt-6 text-muted-foreground leading-relaxed">{craft.content}</p>
        </section>
      )}

      {/* "Our Story" milestones. Renders nothing when the admin switches the
          feature off, so no empty section is left behind. */}
      <CompanyTimeline />

      {/* Same entries as the /faq page — both read from GET /faqs. The
          description is only shown on /faq, as before. */}
      {faq.enabled && faq.faqs.length > 0 && (
        <section className="container-luxe py-20 max-w-3xl mx-auto">
          {faq.eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.35em] text-primary text-center">
              {faq.eyebrow}
            </p>
          )}
          {faq.heading && <h2 className="font-display text-4xl mt-4 text-center">{faq.heading}</h2>}
          <FaqAccordion className="mt-12 w-full" />
        </section>
      )}
    </Shell>
  );
}
