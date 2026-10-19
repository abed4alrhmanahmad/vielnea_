/**
 * Images the admin picked for the homepage Instagram marquee, served from
 * Supabase through the Express API.
 *
 * One record is ONE PICTURE, not one Instagram post. Several records routinely
 * carry the same `instagramUrl` — that is the normal case, not a duplicate to
 * clean up — so nothing here groups, merges or de-duplicates them.
 *
 * There is deliberately no hardcoded image list in this file or in the
 * marquee: the strip renders exactly what `GET /selected-images` returns, so
 * the owner changes it from the admin panel without a code change or a deploy.
 *
 * The endpoint already filters to active images and sorts by display order, so
 * the component renders the array as-is. Nothing in this app talks to
 * Instagram; `instagramUrl` is only where a click goes.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { ApiSelectedImage } from "@/lib/api/types";

export interface SelectedImage {
  id: string;
  imageUrl: string;
  /**
   * The post this tile links to, or null when the admin left it blank. A tile
   * with no link opens the Vielinea homepage instead — see the marquee.
   */
  instagramUrl: string | null;
  displayOrder: number;
  isActive: boolean;
}

function toSelectedImage(api: ApiSelectedImage): SelectedImage {
  return {
    id: api.id,
    imageUrl: api.imageUrl,
    // Blank should never reach here — the API stores null — but an older row
    // or a hand-edited one would otherwise produce `href=""`, which links to
    // the current page rather than falling back.
    instagramUrl: api.instagramUrl?.trim() ? api.instagramUrl : null,
    displayOrder: api.displayOrder,
    isActive: api.isActive,
  };
}

export const selectedImageKeys = {
  all: ["selected-images"] as const,
  active: ["selected-images", "active"] as const,
};

async function fetchSelectedImages(): Promise<SelectedImage[]> {
  const rows = await apiClient.get<ApiSelectedImage[]>("/selected-images");
  return rows.map(toSelectedImage);
}

/**
 * Shared between the homepage route loader and the component, so the strip is
 * present in the server-rendered HTML rather than appearing only after
 * hydration — which also keeps the marquee from shifting the page as it
 * populates.
 */
export function selectedImagesOptions() {
  return queryOptions({
    queryKey: selectedImageKeys.active,
    queryFn: fetchSelectedImages,
    staleTime: 60_000,
  });
}

export function useSelectedImages() {
  return useQuery(selectedImagesOptions());
}
