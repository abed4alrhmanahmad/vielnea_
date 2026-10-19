/**
 * Admin CMS service — website content, backed by Express + Supabase.
 *
 * Replaces the localStorage `siteContentService`. Saving invalidates both the
 * admin cache and the public `["site"]` queries, so an open storefront tab
 * picks up the change without a reload.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, errorMessage } from "@/lib/api/client";
import type { SitePage, SiteSection, Testimonial } from "@/services/site-content";

export type { SitePage, SiteSection, Testimonial };

export interface AdminSiteSettings {
  announcement: { enabled: boolean; text: string };
  header: { nav: Array<{ label: string; href: string; enabled: boolean }> };
  footer: {
    tagline: string;
    copyright: string;
    legal: string;
    columns: Array<{ heading: string; links: Array<{ label: string; href: string }> }>;
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

export const cmsKeys = {
  settings: ["admin", "site", "settings"] as const,
  page: (slug: string) => ["admin", "site", "page", slug] as const,
  testimonials: ["admin", "site", "testimonials"] as const,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export function useCmsSettings() {
  return useQuery({
    queryKey: cmsKeys.settings,
    queryFn: () => apiClient.get<AdminSiteSettings>("/admin/site/settings"),
    staleTime: 15_000,
  });
}

export function useCmsPage(slug: string) {
  return useQuery({
    queryKey: cmsKeys.page(slug),
    queryFn: () => apiClient.get<SitePage>(`/admin/site/pages/${slug}`),
    staleTime: 15_000,
  });
}

export function useCmsTestimonials() {
  return useQuery({
    queryKey: cmsKeys.testimonials,
    queryFn: () => apiClient.get<Testimonial[]>("/admin/site/testimonials"),
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
/** Invalidates admin caches AND the storefront's public CMS queries. */
function useCmsInvalidator() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "site"] });
    void queryClient.invalidateQueries({ queryKey: ["site"] });
  };
}

export function useSaveSettingGroup() {
  const invalidate = useCmsInvalidator();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiClient.put(`/admin/site/settings/${key}`, { value }),
    onSuccess: () => {
      invalidate();
      toast.success("Content saved");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save the content")),
  });
}

export function useSaveStoreSettings() {
  const invalidate = useCmsInvalidator();
  return useMutation({
    mutationFn: (input: Partial<AdminSiteSettings["store"]>) =>
      apiClient.put("/admin/site/settings/store", input),
    onSuccess: () => {
      invalidate();
      toast.success("Store settings saved");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save the settings")),
  });
}

export function useSaveSection() {
  const invalidate = useCmsInvalidator();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SiteSection> }) =>
      apiClient.put<SiteSection>(`/admin/site/sections/${id}`, patch),
    onSuccess: () => {
      invalidate();
      toast.success("Section saved");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save the section")),
  });
}

export function useSavePageSeo() {
  const invalidate = useCmsInvalidator();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SitePage> }) =>
      apiClient.put<SitePage>(`/admin/site/pages/${id}`, patch),
    onSuccess: () => {
      invalidate();
      toast.success("SEO saved");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not save the SEO fields")),
  });
}

export function useTestimonialMutations() {
  const invalidate = useCmsInvalidator();

  const create = useMutation({
    mutationFn: (input: Partial<Testimonial>) =>
      apiClient.post<Testimonial>("/admin/site/testimonials", input),
    onSuccess: () => {
      invalidate();
      toast.success("Testimonial added");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not add the testimonial")),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Testimonial> }) =>
      apiClient.put<Testimonial>(`/admin/site/testimonials/${id}`, patch),
    onSuccess: () => {
      invalidate();
      toast.success("Testimonial updated");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not update the testimonial")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/site/testimonials/${id}`),
    onSuccess: () => {
      invalidate();
      toast("Testimonial deleted");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not delete the testimonial")),
  });

  return { create, update, remove };
}
