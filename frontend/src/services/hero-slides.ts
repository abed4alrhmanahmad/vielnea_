/**
 * Homepage hero slides, served from Supabase through the Express API.
 *
 * There is deliberately no hardcoded slide list here or in any component: the
 * carousel renders exactly what `GET /hero-slides` returns, so an administrator
 * changes the hero from the admin panel without a code change or a deploy.
 *
 * The endpoint already filters to active slides and sorts by display order, so
 * the component renders the array as-is.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { ApiHeroSlide } from "@/lib/api/types";

export interface HeroSlide {
  id: string;
  imageUrl: string;
  eyebrowText: string;
  heading: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  displayOrder: number;
  isActive: boolean;
  /** CSS object-position for the cover crop; defaults to "top" server-side. */
  objectPosition: string;
}

function toHeroSlide(api: ApiHeroSlide): HeroSlide {
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

export const heroSlideKeys = {
  all: ["hero-slides"] as const,
  active: ["hero-slides", "active"] as const,
};

async function fetchHeroSlides(): Promise<HeroSlide[]> {
  const rows = await apiClient.get<ApiHeroSlide[]>("/hero-slides");
  return rows.map(toHeroSlide);
}

/**
 * Shared between the homepage route loader and the component, so the slides
 * are present in the server-rendered HTML rather than appearing only after
 * hydration — the hero heading is the page's h1 and must reach crawlers.
 */
export function heroSlidesOptions() {
  return queryOptions({
    queryKey: heroSlideKeys.active,
    queryFn: fetchHeroSlides,
    staleTime: 60_000,
  });
}

export function useHeroSlides() {
  return useQuery(heroSlidesOptions());
}
