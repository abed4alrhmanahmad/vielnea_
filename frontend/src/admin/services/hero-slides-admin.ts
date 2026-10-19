/**
 * Admin hero-slide management, backed by the Express API (Supabase).
 *
 * Follows the same shape as the other admin services: a `useHeroSlides()` hook
 * returning a plain array, and fire-and-forget mutations that invalidate the
 * caches they affect — including the storefront's `hero-slides` key, so an open
 * homepage tab picks the change up.
 *
 * Image uploads reuse `uploadProductImage` from the products admin service:
 * the same POST /products/images endpoint and the same Supabase Storage bucket
 * the catalogue uses. There is no hero-specific upload path.
 */
import { apiClient, adminKeys, runAdminMutation, useAdminList } from "../lib/api-hooks";
import { heroSlideKeys } from "@/services/hero-slides";
import type { ApiHeroSlide } from "@/lib/api/types";

export {
  uploadProductImage as uploadHeroImage,
  UPLOADABLE_IMAGE_TYPES,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "./products-admin";

export interface AdminHeroSlide {
  id: string;
  imageUrl: string;
  eyebrowText: string;
  heading: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  displayOrder: number;
  isActive: boolean;
  objectPosition: string;
}

export type HeroSlideDraft = Omit<AdminHeroSlide, "id" | "displayOrder">;

function toAdminHeroSlide(api: ApiHeroSlide): AdminHeroSlide {
  return {
    id: api.id,
    imageUrl: api.imageUrl,
    eyebrowText: api.eyebrowText,
    heading: api.heading,
    description: api.description,
    buttonText: api.buttonText,
    buttonLink: api.buttonLink,
    displayOrder: api.displayOrder,
    isActive: api.isActive,
    objectPosition: api.objectPosition || "top",
  };
}

/** Every cache that shows hero content: the admin table and the storefront. */
const HERO_CACHES = [adminKeys.heroSlides, heroSlideKeys.all];

export const heroSlidesService = {
  async fetch(): Promise<AdminHeroSlide[]> {
    const rows = await apiClient.get<ApiHeroSlide[]>("/hero-slides/all");
    return rows.map(toAdminHeroSlide);
  },

  create(input: HeroSlideDraft): void {
    runAdminMutation(() => apiClient.post("/hero-slides", input), {
      invalidate: HERO_CACHES,
      success: "Hero slide created",
      failure: "Could not create the hero slide",
    });
  },

  update(id: string, patch: Partial<AdminHeroSlide>): void {
    const body: Record<string, unknown> = {};
    if (patch.imageUrl !== undefined) body["imageUrl"] = patch.imageUrl;
    if (patch.eyebrowText !== undefined) body["eyebrowText"] = patch.eyebrowText;
    if (patch.heading !== undefined) body["heading"] = patch.heading;
    if (patch.description !== undefined) body["description"] = patch.description;
    if (patch.buttonText !== undefined) body["buttonText"] = patch.buttonText;
    if (patch.buttonLink !== undefined) body["buttonLink"] = patch.buttonLink;
    if (patch.displayOrder !== undefined) body["displayOrder"] = patch.displayOrder;
    if (patch.isActive !== undefined) body["isActive"] = patch.isActive;
    if (patch.objectPosition !== undefined) body["objectPosition"] = patch.objectPosition;

    if (Object.keys(body).length === 0) return;

    runAdminMutation(() => apiClient.put(`/hero-slides/${id}`, body), {
      invalidate: HERO_CACHES,
      success: "Hero slide updated",
      failure: "Could not update the hero slide",
    });
  },

  remove(id: string): void {
    runAdminMutation(() => apiClient.delete(`/hero-slides/${id}`), {
      invalidate: HERO_CACHES,
      success: "Hero slide deleted",
      failure: "Could not delete the hero slide",
    });
  },

  /**
   * Swaps display_order with the neighbouring slide. Reads the current order
   * first so the two updates are based on live data — same approach as the
   * category reorder.
   */
  reorder(id: string, dir: -1 | 1): void {
    runAdminMutation(
      async () => {
        const rows = (await apiClient.get<ApiHeroSlide[]>("/hero-slides/all")).map(
          toAdminHeroSlide,
        );
        const index = rows.findIndex((s) => s.id === id);
        const swapIndex = index + dir;
        if (index < 0 || swapIndex < 0 || swapIndex >= rows.length) return;

        const current = rows[index]!;
        const neighbour = rows[swapIndex]!;

        // display_order carries no unique constraint, so the two rows may hold
        // the same value between these writes without erroring.
        await apiClient.put(`/hero-slides/${current.id}`, { displayOrder: neighbour.displayOrder });
        await apiClient.put(`/hero-slides/${neighbour.id}`, { displayOrder: current.displayOrder });
      },
      {
        invalidate: HERO_CACHES,
        failure: "Could not reorder the hero slides",
      },
    );
  },

  key: "admin-hero-slides",
};

export function useHeroSlides(): AdminHeroSlide[] {
  return useAdminList<ApiHeroSlide, AdminHeroSlide>(
    adminKeys.heroSlides,
    "/hero-slides/all",
    (rows) => rows.map(toAdminHeroSlide),
  );
}
