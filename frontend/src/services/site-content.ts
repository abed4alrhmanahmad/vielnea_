/**
 * Website content, served from Supabase through the Express CMS API.
 *
 * Replaces the localStorage `useSiteContent()` store. The exported
 * `SiteContent` shape is deliberately close to the old one so the header,
 * footer and page components needed only their data source swapped.
 *
 * The defaults below are render fallbacks used only while the first request is
 * in flight (and during SSR) — they are not the source of truth. Every value is
 * seeded into the database, so what customers see always comes from Supabase.
 */
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface NavItem {
  label: string;
  href: string;
  enabled: boolean;
}

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export interface SiteSettings {
  announcement: { enabled: boolean; text: string };
  header: { nav: NavItem[] };
  footer: {
    tagline: string;
    copyright: string;
    legal: string;
    columns: FooterColumn[];
  };
  social: { instagram: string; facebook: string; twitter: string };
  contact: { email: string; phone: string; address: string; hours: string };
  newsletter: { title: string; body: string; buttonText: string; enabled: boolean };
  store: {
    storeName: string;
    storeEmail: string;
    storePhone: string;
    storeAddress: string;
    currency: string;
    standardShipping: number;
  };
}

export interface SiteSection {
  id: string;
  sectionKey: string;
  sectionType: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  imageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  displayOrder: number;
  isVisible: boolean;
  settings: Record<string, unknown>;
}

export interface SitePage {
  id: string;
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  isPublished: boolean;
  sections: SiteSection[];
}

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  quote: string;
  rating: number | null;
  sortOrder: number;
  isActive: boolean;
}

/** Render fallback for the first paint only; the database is authoritative. */
const FALLBACK: SiteSettings = {
  announcement: { enabled: false, text: "" },
  header: { nav: [] },
  footer: { tagline: "", copyright: "", legal: "", columns: [] },
  social: { instagram: "#", facebook: "#", twitter: "#" },
  contact: { email: "", phone: "", address: "", hours: "" },
  newsletter: { title: "", body: "", buttonText: "Subscribe", enabled: true },
  store: {
    storeName: "Vielinea",
    storeEmail: "",
    storePhone: "",
    storeAddress: "",
    currency: "USD",
    standardShipping: 15,
  },
};

export const siteKeys = {
  settings: ["site", "settings"] as const,
  page: (slug: string) => ["site", "page", slug] as const,
  testimonials: ["site", "testimonials"] as const,
};

export async function fetchSiteSettings(): Promise<SiteSettings> {
  const data = await apiClient.get<Partial<SiteSettings>>("/site/settings");
  // Merge per group so a partially-populated settings table still renders.
  return {
    announcement: { ...FALLBACK.announcement, ...(data.announcement ?? {}) },
    header: { ...FALLBACK.header, ...(data.header ?? {}) },
    footer: { ...FALLBACK.footer, ...(data.footer ?? {}) },
    social: { ...FALLBACK.social, ...(data.social ?? {}) },
    contact: { ...FALLBACK.contact, ...(data.contact ?? {}) },
    newsletter: { ...FALLBACK.newsletter, ...(data.newsletter ?? {}) },
    store: { ...FALLBACK.store, ...(data.store ?? {}) },
  };
}

export async function fetchSitePage(slug: string): Promise<SitePage> {
  return apiClient.get<SitePage>(`/site/pages/${encodeURIComponent(slug)}`);
}

export async function fetchTestimonials(): Promise<Testimonial[]> {
  return apiClient.get<Testimonial[]>("/site/testimonials");
}

/**
 * Query options shared between route loaders and components.
 *
 * Route loaders prefetch these so the content is present in the
 * server-rendered HTML — without that, CMS text would only appear after
 * hydration and would be invisible to crawlers.
 */
export function siteSettingsOptions() {
  return queryOptions({
    queryKey: siteKeys.settings,
    queryFn: fetchSiteSettings,
    staleTime: 60_000,
  });
}

export function sitePageOptions(slug: string) {
  return queryOptions({
    queryKey: siteKeys.page(slug),
    queryFn: () => fetchSitePage(slug),
    staleTime: 60_000,
  });
}

export function testimonialsOptions() {
  return queryOptions({
    queryKey: siteKeys.testimonials,
    queryFn: fetchTestimonials,
    staleTime: 60_000,
  });
}

/** Global chrome content: announcement, nav, footer, contact, social. */
export function useSiteSettings(): SiteSettings {
  return useQuery(siteSettingsOptions()).data ?? FALLBACK;
}

export function useSitePage(slug: string) {
  return useQuery(sitePageOptions(slug));
}

export function useTestimonials() {
  return useQuery(testimonialsOptions());
}

/** Looks a section up by key, so components don't depend on ordering. */
export function findSection(page: SitePage | undefined, key: string): SiteSection | undefined {
  return page?.sections.find((s) => s.sectionKey === key);
}

/** Invalidates every CMS query so a storefront tab picks up admin edits. */
export function useInvalidateSiteContent() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["site"] });
  };
}
