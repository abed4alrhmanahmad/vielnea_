/**
 * Admin management of the images shown in the homepage Instagram marquee,
 * backed by the Express API (Supabase).
 *
 * ONE RECORD IS ONE IMAGE. It is not an Instagram post and not a carousel.
 * When the owner publishes a carousel and wants three of its pictures on the
 * site, that is three records which each carry the same `instagramUrl`. They
 * are never grouped, merged or de-duplicated, and the API places no uniqueness
 * constraint on the URL.
 *
 * Nothing here contacts Instagram: the owner uploads the picture themselves
 * and types the post URL, which is used only as a link destination.
 *
 * Follows the same shape as the other admin services: a `useSelectedImages()`
 * hook returning a plain array, and fire-and-forget mutations that invalidate
 * the caches they affect — including the storefront's `selected-images` key,
 * so an open homepage tab picks the change up.
 *
 * Image uploads reuse `uploadProductImage` from the products admin service:
 * the same POST /products/images endpoint, the same Supabase Storage bucket,
 * the same magic-byte validation and the same size cap the catalogue uses.
 * There is no marquee-specific upload path.
 */
import { apiClient, adminKeys, runAdminMutation, useAdminList } from "../lib/api-hooks";
import { selectedImageKeys } from "@/services/selected-images";
import type { ApiSelectedImage } from "@/lib/api/types";

export {
  uploadProductImage as uploadSelectedImage,
  UPLOADABLE_IMAGE_TYPES,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "./products-admin";

export interface AdminSelectedImage {
  id: string;
  imageUrl: string;
  /** Optional. null means the tile falls back to the Vielinea homepage. */
  instagramUrl: string | null;
  displayOrder: number;
  isActive: boolean;
}

export type SelectedImageDraft = Omit<AdminSelectedImage, "id" | "displayOrder">;

function toAdminSelectedImage(api: ApiSelectedImage): AdminSelectedImage {
  return {
    id: api.id,
    imageUrl: api.imageUrl,
    instagramUrl: api.instagramUrl?.trim() ? api.instagramUrl : null,
    displayOrder: api.displayOrder,
    isActive: api.isActive,
  };
}

/** Every cache that shows marquee content: the admin table and the storefront. */
const SELECTED_IMAGE_CACHES = [adminKeys.selectedImages, selectedImageKeys.all];

export const selectedImagesService = {
  async fetch(): Promise<AdminSelectedImage[]> {
    const rows = await apiClient.get<ApiSelectedImage[]>("/selected-images/all");
    return rows.map(toAdminSelectedImage);
  },

  create(input: SelectedImageDraft): void {
    runAdminMutation(() => apiClient.post("/selected-images", input), {
      invalidate: SELECTED_IMAGE_CACHES,
      success: "Selected image added",
      failure: "Could not add the selected image",
    });
  },

  update(id: string, patch: Partial<AdminSelectedImage>): void {
    const body: Record<string, unknown> = {};
    if (patch.imageUrl !== undefined) body["imageUrl"] = patch.imageUrl;
    // null is sent deliberately: it clears the link, which is different from
    // omitting the key, which leaves whatever is stored alone.
    if (patch.instagramUrl !== undefined) body["instagramUrl"] = patch.instagramUrl;
    if (patch.displayOrder !== undefined) body["displayOrder"] = patch.displayOrder;
    if (patch.isActive !== undefined) body["isActive"] = patch.isActive;

    if (Object.keys(body).length === 0) return;

    runAdminMutation(() => apiClient.put(`/selected-images/${id}`, body), {
      invalidate: SELECTED_IMAGE_CACHES,
      success: "Selected image updated",
      failure: "Could not update the selected image",
    });
  },

  remove(id: string): void {
    runAdminMutation(() => apiClient.delete(`/selected-images/${id}`), {
      invalidate: SELECTED_IMAGE_CACHES,
      success: "Selected image deleted",
      failure: "Could not delete the selected image",
    });
  },

  /**
   * Swaps display_order with the neighbouring image. Reads the current order
   * first so the two updates are based on live data — same approach as the
   * hero-slide and category reorder.
   */
  reorder(id: string, dir: -1 | 1): void {
    runAdminMutation(
      async () => {
        const rows = (await apiClient.get<ApiSelectedImage[]>("/selected-images/all")).map(
          toAdminSelectedImage,
        );
        const index = rows.findIndex((s) => s.id === id);
        const swapIndex = index + dir;
        if (index < 0 || swapIndex < 0 || swapIndex >= rows.length) return;

        const current = rows[index]!;
        const neighbour = rows[swapIndex]!;

        // display_order carries no unique constraint, so the two rows may hold
        // the same value between these writes without erroring.
        await apiClient.put(`/selected-images/${current.id}`, {
          displayOrder: neighbour.displayOrder,
        });
        await apiClient.put(`/selected-images/${neighbour.id}`, {
          displayOrder: current.displayOrder,
        });
      },
      {
        invalidate: SELECTED_IMAGE_CACHES,
        failure: "Could not reorder the selected images",
      },
    );
  },

  key: "admin-selected-images",
};

export function useSelectedImages(): AdminSelectedImage[] {
  return useAdminList<ApiSelectedImage, AdminSelectedImage>(
    adminKeys.selectedImages,
    "/selected-images/all",
    (rows) => rows.map(toAdminSelectedImage),
  );
}
