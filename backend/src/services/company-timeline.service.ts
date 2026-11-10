import { companyTimelineRepository } from "../repositories/company-timeline.repository.js";
import { NotFoundError } from "../lib/errors.js";
import { cached, invalidateCache } from "../lib/cache.js";
import type { TimelineEntry, TimelineFeature } from "../types/models.js";
import type { z } from "zod";
import type { createTimelineEntrySchema, updateTimelineEntrySchema } from "../schemas/index.js";

type CreateInput = z.infer<typeof createTimelineEntrySchema>;
type UpdateInput = z.infer<typeof updateTimelineEntrySchema>;

/**
 * Read on every About page render; the database is remote (two queries,
 * ~230ms each), so repeat reads come from memory. Every entry write below
 * invalidates it, and so does a CMS section save (cms.controller.ts), because
 * the feature switch and header copy live on the CMS `timeline` section — an
 * admin change still shows immediately; the TTL is only a safety net.
 */
export const TIMELINE_PUBLIC_CACHE_KEY = "company-timeline:public";
const PUBLIC_CACHE_TTL_MS = 5 * 60_000;

export interface TimelinePayload {
  enabled: boolean;
  section: TimelineFeature;
  entries: TimelineEntry[];
}

/**
 * The About page's "Our Story" timeline.
 *
 * Reads pair the feature switch with the entries in one response so the About
 * page makes a single request and can decide, from that alone, whether to
 * render the section at all.
 *
 * The switch itself lives on the CMS `timeline` section and is toggled through
 * the existing PUT /admin/site/sections/:id — deliberately not duplicated here,
 * so there is one place that decides whether a page section is visible.
 */
export const companyTimelineService = {
  /** Storefront: the switch plus active entries only. */
  publicView(): Promise<TimelinePayload> {
    return cached(TIMELINE_PUBLIC_CACHE_KEY, PUBLIC_CACHE_TTL_MS, () => this.loadPublicView());
  },

  async loadPublicView(): Promise<TimelinePayload> {
    const [section, entries] = await Promise.all([
      companyTimelineRepository.findFeature(),
      companyTimelineRepository.findActive(),
    ]);
    // When the feature is off, neither the entries nor the section's heading
    // copy are sent: the storefront renders nothing, so shipping either would
    // only leak hidden content into the page payload. Everything stays safely
    // in the database and comes back when the feature is switched on.
    if (!section.enabled) {
      return {
        enabled: false,
        section: { ...section, title: null, subtitle: null, content: null },
        entries: [],
      };
    }
    return { enabled: true, section, entries };
  },

  /** Admin: the switch plus every entry, including inactive ones. */
  async adminView(): Promise<TimelinePayload> {
    const [section, entries] = await Promise.all([
      companyTimelineRepository.findFeature(),
      companyTimelineRepository.findAll(),
    ]);
    return { enabled: section.enabled, section, entries };
  },

  async create(input: CreateInput): Promise<TimelineEntry> {
    const entry = await companyTimelineRepository.create(input);
    invalidateCache(TIMELINE_PUBLIC_CACHE_KEY);
    return entry;
  },

  async update(id: string, input: UpdateInput): Promise<TimelineEntry> {
    const updated = await companyTimelineRepository.update(id, input);
    if (!updated) throw new NotFoundError("Timeline entry not found");
    invalidateCache(TIMELINE_PUBLIC_CACHE_KEY);
    return updated;
  },

  async remove(id: string): Promise<void> {
    const deleted = await companyTimelineRepository.remove(id);
    if (!deleted) throw new NotFoundError("Timeline entry not found");
    invalidateCache(TIMELINE_PUBLIC_CACHE_KEY);
  },
};
