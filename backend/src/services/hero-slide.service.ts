import { heroSlideRepository } from "../repositories/hero-slide.repository.js";
import { NotFoundError } from "../lib/errors.js";
import { cached, invalidateCache } from "../lib/cache.js";
import type { HeroSlide } from "../types/models.js";
import type { z } from "zod";
import type { createHeroSlideSchema, updateHeroSlideSchema } from "../schemas/index.js";

type CreateInput = z.infer<typeof createHeroSlideSchema>;
type UpdateInput = z.infer<typeof updateHeroSlideSchema>;

const ACTIVE_CACHE_KEY = "hero-slides:active";
// Loaded on every homepage visit; the database is remote, so this avoids
// that round trip on repeat requests. create/update/remove below each
// invalidate it, so an admin change still appears immediately and the TTL is
// only a safety net — long is safe and keeps the hero off the critical path.
const ACTIVE_CACHE_TTL_MS = 5 * 60_000;

/**
 * Homepage hero carousel slides.
 *
 * Reads split by audience: the storefront only ever sees active slides, while
 * the admin panel sees everything so a hidden slide can be found and switched
 * back on.
 */
export const heroSlideService = {
  /** Storefront: active slides in carousel order. */
  listActive(): Promise<HeroSlide[]> {
    return cached(ACTIVE_CACHE_KEY, ACTIVE_CACHE_TTL_MS, () => heroSlideRepository.findActive());
  },

  /** Admin: every slide, including inactive ones. */
  listAll(): Promise<HeroSlide[]> {
    return heroSlideRepository.findAll();
  },

  async getById(id: string): Promise<HeroSlide> {
    const slide = await heroSlideRepository.findById(id);
    if (!slide) throw new NotFoundError("Hero slide not found");
    return slide;
  },

  async create(input: CreateInput): Promise<HeroSlide> {
    const slide = await heroSlideRepository.create(input);
    invalidateCache(ACTIVE_CACHE_KEY);
    return slide;
  },

  async update(id: string, input: UpdateInput): Promise<HeroSlide> {
    const updated = await heroSlideRepository.update(id, input);
    if (!updated) throw new NotFoundError("Hero slide not found");
    invalidateCache(ACTIVE_CACHE_KEY);
    return updated;
  },

  async remove(id: string): Promise<void> {
    const deleted = await heroSlideRepository.remove(id);
    if (!deleted) throw new NotFoundError("Hero slide not found");
    invalidateCache(ACTIVE_CACHE_KEY);
  },
};
