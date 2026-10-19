import { selectedImageRepository } from "../repositories/selected-image.repository.js";
import { NotFoundError } from "../lib/errors.js";
import { cached, invalidateCache } from "../lib/cache.js";
import type { SelectedImage } from "../types/models.js";
import type { z } from "zod";
import type { createSelectedImageSchema, updateSelectedImageSchema } from "../schemas/index.js";

type CreateInput = z.infer<typeof createSelectedImageSchema>;
type UpdateInput = z.infer<typeof updateSelectedImageSchema>;

const ACTIVE_CACHE_KEY = "selected-images:active";
// Loaded on every homepage visit; the database is remote, so this avoids that
// round trip on repeat requests. create/update/remove below each invalidate
// it, so an admin change still appears immediately and the TTL is only a
// safety net. Mirrors the hero-slides service.
const ACTIVE_CACHE_TTL_MS = 5 * 60_000;

/**
 * Images the admin has picked for the homepage Instagram marquee.
 *
 * Reads split by audience: the storefront only ever sees active images, while
 * the admin panel sees everything so a hidden one can be found and switched
 * back on. The active/order filtering is done in SQL, so the public response
 * never carries a row the marquee should not render.
 */
export const selectedImageService = {
  /** Storefront: active images in marquee order. */
  listActive(): Promise<SelectedImage[]> {
    return cached(ACTIVE_CACHE_KEY, ACTIVE_CACHE_TTL_MS, () =>
      selectedImageRepository.findActive(),
    );
  },

  /** Admin: every image, including inactive ones. */
  listAll(): Promise<SelectedImage[]> {
    return selectedImageRepository.findAll();
  },

  async getById(id: string): Promise<SelectedImage> {
    const image = await selectedImageRepository.findById(id);
    if (!image) throw new NotFoundError("Selected image not found");
    return image;
  },

  async create(input: CreateInput): Promise<SelectedImage> {
    const image = await selectedImageRepository.create(input);
    invalidateCache(ACTIVE_CACHE_KEY);
    return image;
  },

  async update(id: string, input: UpdateInput): Promise<SelectedImage> {
    const updated = await selectedImageRepository.update(id, input);
    if (!updated) throw new NotFoundError("Selected image not found");
    invalidateCache(ACTIVE_CACHE_KEY);
    return updated;
  },

  async remove(id: string): Promise<void> {
    const deleted = await selectedImageRepository.remove(id);
    if (!deleted) throw new NotFoundError("Selected image not found");
    invalidateCache(ACTIVE_CACHE_KEY);
  },
};
