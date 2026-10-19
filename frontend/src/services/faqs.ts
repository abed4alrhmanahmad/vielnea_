/**
 * The site FAQ, served from Supabase through the Express API.
 *
 * One request carries the section switch, its header copy and the questions,
 * so /faq and the About page can each decide whether to render the section at
 * all without a second round-trip. There are deliberately no questions,
 * answers or header strings in this file or in any component.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { ApiFaqPayload } from "@/lib/api/types";

export interface Faq {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
}

export interface FaqContent {
  /** False hides the whole section; the questions stay in the database. */
  enabled: boolean;
  /** Header copy, from the CMS `faq` section. */
  eyebrow: string | null;
  heading: string | null;
  description: string | null;
  faqs: Faq[];
}

const EMPTY: FaqContent = {
  enabled: false,
  eyebrow: null,
  heading: null,
  description: null,
  faqs: [],
};

export const faqKeys = {
  all: ["faqs"] as const,
};

async function fetchFaqs(): Promise<FaqContent> {
  const data = await apiClient.get<ApiFaqPayload>("/faqs");
  return {
    enabled: data.enabled,
    eyebrow: data.section?.subtitle ?? null,
    heading: data.section?.title ?? null,
    description: data.section?.content ?? null,
    faqs: data.faqs.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      displayOrder: f.displayOrder,
      isActive: f.isActive,
    })),
  };
}

/**
 * Shared between the /faq and /about route loaders and the components, so the
 * questions are server-rendered rather than appearing only after hydration —
 * the FAQ page's structured data is built from the same loaded values.
 */
export function faqsOptions() {
  return queryOptions({
    queryKey: faqKeys.all,
    queryFn: fetchFaqs,
    staleTime: 60_000,
  });
}

export function useFaqs(): FaqContent {
  return useQuery(faqsOptions()).data ?? EMPTY;
}
