import { z } from "zod";
import { asyncHandler, sendData } from "../lib/http.js";
import { cmsRepository } from "../repositories/cms.repository.js";
import { env } from "../config/env.js";
import { cardPaymentsReady } from "../services/payment/index.js";
import {
  PAYMENT_METHODS_SETTING_KEY,
  availableMethods,
  paymentMethodTogglesSchema,
  readPaymentToggles,
} from "../services/payment/methods.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { isUuid } from "../utils/slug.js";
import { invalidateShippingCache } from "../services/cart.service.js";
import { cached, invalidateCache } from "../lib/cache.js";

// Loaded on every homepage/page visit; the database is remote, so this
// avoids paying that round trip on repeat requests between admin edits (the
// write handlers below each invalidate the relevant prefix immediately).
// Because every write invalidates, the TTL is only a safety net and can be
// long — a short one just meant most visitors paid the round trip again.
const PAGE_CACHE_TTL_MS = 5 * 60_000;
const TESTIMONIALS_CACHE_KEY = "cms:testimonials:public";
const TESTIMONIALS_CACHE_TTL_MS = 5 * 60_000;
const SETTINGS_CACHE_KEY = "cms:settings:public";
const SETTINGS_CACHE_TTL_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

const sectionUpdateSchema = z
  .object({
    title: nullableText(200),
    subtitle: nullableText(200),
    content: z.string().trim().max(5000).nullable().optional(),
    imageUrl: nullableText(500),
    buttonText: nullableText(80),
    buttonUrl: nullableText(500),
    displayOrder: z.coerce.number().int().min(0).max(1000).optional(),
    isVisible: z.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

const pageUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    metaTitle: nullableText(200),
    metaDescription: nullableText(400),
    ogTitle: nullableText(200),
    ogDescription: nullableText(400),
    ogImage: nullableText(500),
    isPublished: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

/** Settings groups are free-form documents; the shape is owned by the UI. */
const settingValueSchema = z.object({
  value: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]),
});

const settingKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9_-]+$/, "Setting keys use lowercase letters, numbers, hyphens and underscores");

const storeSettingsSchema = z
  .object({
    storeName: z.string().trim().min(1).max(120).optional(),
    storeEmail: z.string().trim().email().max(200).optional(),
    storePhone: z.string().trim().max(60).optional(),
    storeAddress: z.string().trim().max(300).optional(),
    currency: z.string().trim().length(3).optional(),
    standardShipping: z.coerce.number().min(0).max(1_000_000).optional(),
    socialInstagram: z.string().trim().max(300).optional(),
    socialFacebook: z.string().trim().max(300).optional(),
    socialTwitter: z.string().trim().max(300).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

const testimonialSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  location: z.string().trim().max(120).default(""),
  quote: z.string().trim().min(5, "Quote is required").max(1000),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().default(true),
});

const testimonialUpdateSchema = testimonialSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

const mediaSchema = z.object({
  type: z.enum(["product", "hero", "banner", "category"]).default("product"),
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(500),
});

function requireUuid(value: string | undefined, label: string): string {
  if (!value || !isUuid(value)) throw new BadRequestError(`Malformed ${label} id`);
  return value;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const cmsController = {
  // ------------------------------------------------------------ public ----
  /** All settings groups + store settings, for header/footer/global chrome. */
  publicSettings: asyncHandler(async (_req, res) => {
    // Read on every server-rendered page (the root loader prefetches it for
    // the header, footer and announcement bar), so it is the single hottest
    // CMS query there is — and the database is remote, so each miss pays a
    // full round trip. Same 20s TTL and same explicit invalidation as the
    // page and testimonial caches above; `adminSettings` stays uncached so
    // the admin always reads live values.
    const payload = await cached(SETTINGS_CACHE_KEY, SETTINGS_CACHE_TTL_MS, async () => {
      const [settings, store] = await Promise.all([
        cmsRepository.allSettings(),
        cmsRepository.storeSettings(),
      ]);
      // Payment methods checkout may offer, resolved server-side (admin toggles
      // plus whether a real card processor is configured).
      const checkoutPayments = availableMethods(
        readPaymentToggles(settings[PAYMENT_METHODS_SETTING_KEY]),
      );
      return { ...settings, store, checkoutPayments };
    });
    sendData(res, payload);
  }),

  /** A published page with its visible sections. */
  publicPage: asyncHandler(async (req, res) => {
    const slug = String(req.params["slug"] ?? "").trim();
    const page = await cached(`cms:page:${slug}`, PAGE_CACHE_TTL_MS, () =>
      cmsRepository.findPageBySlug(slug, true),
    );
    if (!page) throw new NotFoundError("Page not found");

    sendData(res, {
      ...page,
      sections: page.sections.filter((s) => s.isVisible),
    });
  }),

  publicTestimonials: asyncHandler(async (_req, res) => {
    const testimonials = await cached(TESTIMONIALS_CACHE_KEY, TESTIMONIALS_CACHE_TTL_MS, () =>
      cmsRepository.listTestimonials(true),
    );
    sendData(res, testimonials);
  }),

  // ------------------------------------------------------------- admin ----
  adminSettings: asyncHandler(async (_req, res) => {
    const [settings, store] = await Promise.all([
      cmsRepository.allSettings(),
      cmsRepository.storeSettings(),
    ]);
    sendData(res, {
      ...settings,
      store,
      // Lets the Payment Methods switches explain when card cannot be offered.
      cardPayments: { ready: cardPaymentsReady(), provider: env.PAYMENT_PROVIDER },
    });
  }),

  updateSetting: asyncHandler(async (req, res) => {
    const key = settingKeySchema.parse(req.params["key"]);
    const { value } = settingValueSchema.parse(req.body);
    // Checkout reads this one, so only the exact switch shape is accepted.
    if (key === PAYMENT_METHODS_SETTING_KEY) paymentMethodTogglesSchema.parse(value);
    const updated = await cmsRepository.setSetting(key, value);
    // Public settings are cached; drop it so the edit shows on the next request.
    invalidateCache(SETTINGS_CACHE_KEY);
    sendData(res, { key, value: updated });
  }),

  updateStoreSettings: asyncHandler(async (req, res) => {
    const input = storeSettingsSchema.parse(req.body);
    const updated = await cmsRepository.updateStoreSettings(input);
    // Shipping rules are cached on the checkout hot path; drop the cache so an
    // admin change takes effect on the very next request.
    invalidateShippingCache();
    // Store settings are part of the public settings payload, so that cache
    // has to go too or the storefront would serve the old values for 20s.
    invalidateCache(SETTINGS_CACHE_KEY);
    sendData(res, updated);
  }),

  adminPages: asyncHandler(async (_req, res) => {
    sendData(res, await cmsRepository.listPages());
  }),

  /** Admin view includes unpublished pages and hidden sections. */
  adminPage: asyncHandler(async (req, res) => {
    const slug = String(req.params["slug"] ?? "").trim();
    const page = await cmsRepository.findPageBySlug(slug, false);
    if (!page) throw new NotFoundError("Page not found");
    sendData(res, page);
  }),

  updatePage: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "page");
    const input = pageUpdateSchema.parse(req.body);
    const page = await cmsRepository.updatePage(id, input);
    if (!page) throw new NotFoundError("Page not found");
    // Cached by slug (see publicPage above); clearing every "cms:page:"
    // entry is simplest and still cheap since page edits are infrequent.
    invalidateCache("cms:page:");
    sendData(res, page);
  }),

  updateSection: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "section");
    const input = sectionUpdateSchema.parse(req.body);
    const section = await cmsRepository.updateSection(id, input);
    if (!section) throw new NotFoundError("Section not found");
    invalidateCache("cms:page:");
    sendData(res, section);
  }),

  // -------------------------------------------------------- testimonials --
  adminTestimonials: asyncHandler(async (_req, res) => {
    sendData(res, await cmsRepository.listTestimonials(false));
  }),

  createTestimonial: asyncHandler(async (req, res) => {
    const input = testimonialSchema.parse(req.body);
    const testimonial = await cmsRepository.createTestimonial(input);
    invalidateCache(TESTIMONIALS_CACHE_KEY);
    sendData(res, testimonial, 201);
  }),

  updateTestimonial: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "testimonial");
    const input = testimonialUpdateSchema.parse(req.body);
    const updated = await cmsRepository.updateTestimonial(id, input);
    if (!updated) throw new NotFoundError("Testimonial not found");
    invalidateCache(TESTIMONIALS_CACHE_KEY);
    sendData(res, updated);
  }),

  deleteTestimonial: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "testimonial");
    const ok = await cmsRepository.deleteTestimonial(id);
    if (!ok) throw new NotFoundError("Testimonial not found");
    invalidateCache(TESTIMONIALS_CACHE_KEY);
    sendData(res, { message: "Testimonial deleted" });
  }),

  // --------------------------------------------------------------- media --
  listMedia: asyncHandler(async (_req, res) => {
    sendData(res, await cmsRepository.listMedia());
  }),

  createMedia: asyncHandler(async (req, res) => {
    const input = mediaSchema.parse(req.body);
    sendData(res, await cmsRepository.createMedia(input), 201);
  }),

  deleteMedia: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "media");
    const ok = await cmsRepository.deleteMedia(id);
    if (!ok) throw new NotFoundError("Media asset not found");
    sendData(res, { message: "Media asset deleted" });
  }),
};
