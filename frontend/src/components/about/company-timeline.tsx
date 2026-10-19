import { motion } from "framer-motion";
import { useCompanyTimeline } from "@/services/company-timeline";
import { IMAGE_SIZES, ResponsiveImage } from "@/components/responsive-image";

/**
 * The "Our Story" timeline on the About page.
 *
 * Renders nothing at all — no heading, container, spacing or background —
 * unless the admin has the feature switched on AND there is at least one
 * active milestone. Returning null keeps the page free of an empty shell when
 * the section is off.
 *
 * Every value shown comes from `GET /company-timeline`; there is no company
 * history in this file.
 */
export function CompanyTimeline() {
  const { enabled, title, subtitle, intro, entries } = useCompanyTimeline();

  if (!enabled || entries.length === 0) return null;

  return (
    <section className="bg-secondary/50 border-y border-border">
      <div className="container-luxe py-20">
        <div className="text-center max-w-2xl mx-auto">
          {subtitle && (
            <p className="text-[11px] uppercase tracking-[0.35em] text-primary">{subtitle}</p>
          )}
          {title && <h2 className="font-display text-4xl mt-4">{title}</h2>}
          {intro && <p className="mt-6 text-muted-foreground leading-relaxed">{intro}</p>}
        </div>

        <ol className="relative mt-16 max-w-3xl mx-auto">
          {/* The spine. Hidden from assistive tech: it is pure decoration, and
              the list itself already conveys the sequence. */}
          <span
            aria-hidden="true"
            className="absolute left-[7px] md:left-1/2 md:-ml-px top-2 bottom-2 w-px bg-border"
          />

          {entries.map((entry, i) => (
            <motion.li
              key={entry.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="relative pl-8 md:pl-0 pb-14 last:pb-0"
            >
              {/* Node on the spine */}
              <span
                aria-hidden="true"
                className="absolute left-0 md:left-1/2 md:-ml-[5px] top-2 size-2.5 rounded-full bg-primary ring-4 ring-secondary/50"
              />

              {/* Alternating sides on desktop; a single left-aligned rail on
                  mobile, where alternating would be unreadable. */}
              <div
                className={`md:w-1/2 ${
                  i % 2 === 0 ? "md:pr-12 md:text-right" : "md:ml-auto md:pl-12"
                }`}
              >
                <p className="font-display text-3xl text-primary leading-none">{entry.year}</p>
                <h3 className="mt-3 text-sm uppercase tracking-[0.2em] text-foreground">
                  {entry.title}
                </h3>
                {entry.description && (
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {entry.description}
                  </p>
                )}
                {/* Images are optional — entries without one just omit it. */}
                {entry.imageUrl && (
                  <ResponsiveImage
                    src={entry.imageUrl}
                    alt={`${entry.year} — ${entry.title}`}
                    sizes={IMAGE_SIZES.timeline}
                    loading="lazy"
                    className="mt-5 w-full aspect-[3/2] object-cover rounded-lg border border-border"
                  />
                )}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
