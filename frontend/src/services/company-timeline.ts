/**
 * The About page's company timeline, served from Supabase through the Express
 * API.
 *
 * One request carries both the feature switch and the entries, so the About
 * page can decide whether to render the section at all without a second
 * round-trip. There is deliberately no company history in this file or in any
 * component: everything below comes from the database.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { ApiCompanyTimeline } from "@/lib/api/types";

export interface TimelineEntry {
  id: string;
  year: string;
  title: string;
  description: string;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
}

export interface CompanyTimeline {
  /** False hides the whole section; the entries stay in the database. */
  enabled: boolean;
  /** Heading copy, from the CMS `timeline` section on the About page. */
  title: string | null;
  subtitle: string | null;
  intro: string | null;
  entries: TimelineEntry[];
}

const EMPTY: CompanyTimeline = {
  enabled: false,
  title: null,
  subtitle: null,
  intro: null,
  entries: [],
};

export const companyTimelineKeys = {
  all: ["company-timeline"] as const,
};

async function fetchCompanyTimeline(): Promise<CompanyTimeline> {
  const data = await apiClient.get<ApiCompanyTimeline>("/company-timeline");
  return {
    enabled: data.enabled,
    title: data.section?.title ?? null,
    subtitle: data.section?.subtitle ?? null,
    intro: data.section?.content ?? null,
    entries: data.entries.map((e) => ({
      id: e.id,
      year: e.year,
      title: e.title,
      description: e.description,
      imageUrl: e.imageUrl,
      displayOrder: e.displayOrder,
      isActive: e.isActive,
    })),
  };
}

/**
 * Shared between the About route loader and the component, so the milestones
 * are server-rendered rather than appearing only after hydration.
 */
export function companyTimelineOptions() {
  return queryOptions({
    queryKey: companyTimelineKeys.all,
    queryFn: fetchCompanyTimeline,
    staleTime: 60_000,
  });
}

export function useCompanyTimeline(): CompanyTimeline {
  return useQuery(companyTimelineOptions()).data ?? EMPTY;
}
