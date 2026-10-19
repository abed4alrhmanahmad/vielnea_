import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { FaqAccordion } from "@/components/faq-accordion";
import { faqsOptions, useFaqs, type FaqContent } from "@/services/faqs";

export const Route = createFileRoute("/faq")({
  // Loaded server-side so the questions reach both the rendered HTML and the
  // FAQPage structured data below.
  loader: async ({ context }): Promise<{ faq: FaqContent }> => ({
    faq: await context.queryClient.ensureQueryData(faqsOptions()),
  }),
  head: ({ loaderData }) => ({
    meta: [
      { title: "FAQ — Vielinea" },
      {
        name: "description",
        content:
          "Answers to common questions about Vielinea orders, shipping, returns, sizing and care.",
      },
      { property: "og:title", content: "FAQ — Vielinea" },
      {
        property: "og:description",
        content: "Everything you need to know about shopping with Vielinea.",
      },
      { property: "og:url", content: "/faq" },
    ],
    links: [{ rel: "canonical", href: "/faq" }],
    // Built from the same rows the page renders, so the structured data can
    // never drift from what a visitor sees. Omitted entirely when the section
    // is switched off or empty.
    scripts:
      loaderData && loaderData.faq.enabled && loaderData.faq.faqs.length > 0
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: loaderData.faq.faqs.map((f) => ({
                  "@type": "Question",
                  name: f.question,
                  acceptedAnswer: { "@type": "Answer", text: f.answer },
                })),
              }),
            },
          ]
        : [],
  }),
  component: FaqPage,
});

function FaqPage() {
  const { enabled, eyebrow, heading, description, faqs } = useFaqs();

  // The whole section is admin-controlled: when it is off, the page keeps its
  // chrome but carries no FAQ heading, copy, spacing or accordion.
  const visible = enabled && faqs.length > 0;

  return (
    <Shell>
      {visible && (
        <section className="container-luxe py-16 md:py-24 max-w-3xl">
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.35em] text-primary text-center mb-4">
              {eyebrow}
            </p>
          )}
          {heading && (
            <h1 className="font-display text-4xl md:text-5xl text-center text-foreground">
              {heading}
            </h1>
          )}
          <p className="mt-4 text-center text-muted-foreground max-w-xl mx-auto">
            {description}{" "}
            {/* The contact prompt is page furniture rather than FAQ copy, so it
                stays in the layout and keeps its link. */}
            Can&apos;t find your answer?{" "}
            <a
              href="/contact"
              className="text-primary hover:text-primary-dark underline underline-offset-4"
            >
              Contact our team
            </a>
            .
          </p>

          <FaqAccordion className="mt-12 w-full" />
        </section>
      )}
    </Shell>
  );
}
