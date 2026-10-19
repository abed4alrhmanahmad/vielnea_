import { faqRepository } from "../repositories/faq.repository.js";
import { NotFoundError } from "../lib/errors.js";
import type { Faq, FaqSection } from "../types/models.js";
import type { z } from "zod";
import type { createFaqSchema, updateFaqSchema } from "../schemas/index.js";

type CreateInput = z.infer<typeof createFaqSchema>;
type UpdateInput = z.infer<typeof updateFaqSchema>;

export interface FaqPayload {
  enabled: boolean;
  section: FaqSection;
  faqs: Faq[];
}

/**
 * The site FAQ, rendered on /faq and near the bottom of the About page.
 *
 * Reads pair the section switch with the questions in one response so each
 * page makes a single request and can decide, from that alone, whether to
 * render the section at all.
 *
 * The switch itself lives on the CMS `faq` section and is toggled through the
 * existing PUT /admin/site/sections/:id — deliberately not duplicated here, so
 * there is one mechanism deciding whether a page section renders.
 */
export const faqService = {
  /** Storefront: the switch plus active questions only. */
  async publicView(): Promise<FaqPayload> {
    const [section, faqs] = await Promise.all([
      faqRepository.findSection(),
      faqRepository.findActive(),
    ]);
    // When the section is off, neither the questions nor the header copy are
    // sent: the pages render nothing, so shipping either would only leak
    // hidden content into the payload. Everything stays in the database.
    if (!section.enabled) {
      return {
        enabled: false,
        section: { ...section, title: null, subtitle: null, content: null },
        faqs: [],
      };
    }
    return { enabled: true, section, faqs };
  },

  /** Admin: the switch plus every question, including inactive ones. */
  async adminView(): Promise<FaqPayload> {
    const [section, faqs] = await Promise.all([
      faqRepository.findSection(),
      faqRepository.findAll(),
    ]);
    return { enabled: section.enabled, section, faqs };
  },

  create(input: CreateInput): Promise<Faq> {
    return faqRepository.create(input);
  },

  async update(id: string, input: UpdateInput): Promise<Faq> {
    const updated = await faqRepository.update(id, input);
    if (!updated) throw new NotFoundError("FAQ not found");
    return updated;
  },

  async remove(id: string): Promise<void> {
    const deleted = await faqRepository.remove(id);
    if (!deleted) throw new NotFoundError("FAQ not found");
  },
};
