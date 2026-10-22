import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(255)
  .email("Enter a valid email address")
  .transform((v) => v.toLowerCase());

export const idOrSlugSchema = z
  .string()
  .trim()
  .min(1, "Identifier is required")
  .max(120)
  .regex(/^[a-zA-Z0-9._-]+$/, "Identifier contains invalid characters");

export const idParamSchema = z.object({ id: idOrSlugSchema });
export const slugParamSchema = z.object({ slug: idOrSlugSchema });
export const productIdParamSchema = z.object({ productId: idOrSlugSchema });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: emailSchema,
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(200, "Password is too long"),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(200),
});

/** Self-service profile edit. Role is deliberately not editable here. */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: emailSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(200),
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(200, "Password is too long"),
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export const productSortSchema = z.enum([
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "rating",
  "title_asc",
  "title_desc",
  // Pure creation date, newest first (`newest` puts admin-flagged arrivals first).
  "recent",
  // Units sold on non-cancelled orders; lists only products that have sold.
  "best_selling",
]);

/**
 * Accepts both the API-native sort keys and the keys the existing storefront
 * already puts in the URL (`price-asc`, `price-desc`), so shareable shop links
 * keep working unchanged.
 */
const sortAliases: Record<string, z.infer<typeof productSortSchema>> = {
  "price-asc": "price_asc",
  "price-desc": "price_desc",
  priceasc: "price_asc",
  pricedesc: "price_desc",
};

export const productQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  sort: z
    .string()
    .optional()
    .transform((v) => (v ? (sortAliases[v] ?? v) : undefined))
    .pipe(productSortSchema.optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  featured: z.coerce.boolean().optional(),
  bestSeller: z.coerce.boolean().optional(),
  newArrival: z.coerce.boolean().optional(),
  gift: z.coerce.boolean().optional(),
  // Only products with at least one image and a price above zero (homepage New Arrivals).
  complete: z.coerce.boolean().optional(),
  inStock: z.coerce.boolean().optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

const sizeInputSchema = z.object({
  size: z.string().trim().min(1).max(30),
  stock: z.number().int().min(0).max(100_000).default(0),
});

const measurementInputSchema = z.object({
  size: z.string().trim().min(1).max(30),
  bust: z.number().min(0).max(500).nullable().optional(),
  waist: z.number().min(0).max(500).nullable().optional(),
  hips: z.number().min(0).max(500).nullable().optional(),
  length: z.number().min(0).max(500).nullable().optional(),
  labels: z.record(z.string().max(60), z.string().max(60)).default({}),
});

const imageInputSchema = z.object({
  imageUrl: z.string().trim().min(1).max(500),
  altText: z.string().trim().max(200).nullable().optional(),
});

/**
 * Every Admin Product field is optional (title, category, price, discount,
 * stock, ...): an empty form must be a valid create request. HTML number
 * inputs and a cleared text field both submit "" rather than omitting the
 * key, so "" and null are normalised to undefined here — the same place a
 * missing key would land — before the field's own validation runs. That
 * keeps "blank" and "not sent" indistinguishable, which is what lets
 * `.optional()`/`.default()` below do the rest.
 */
const emptyToUndefined = (value: unknown): unknown =>
  value === "" ||
  value === null ||
  (typeof value === "number" && Number.isNaN(value))
    ? undefined
    : value;

/**
 * Optional trimmed string: blank stays blank/absent, never a validation
 * error. `.optional()` sits on the *inner* schema, not the preprocess
 * wrapper — preprocess always runs first and only ever hands the inner
 * schema either a real value or `undefined`; putting `.optional()` outside
 * would only catch a structurally-missing key, not an explicit "" that
 * preprocess turns into undefined afterward.
 */
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

/** Optional number: blank stays blank/absent; an actual value is still range-checked. */
const optionalNumber = (inner: z.ZodNumber) => z.preprocess(emptyToUndefined, inner.optional());

export const createProductSchema = z.object({
  // Title is optional — no minimum length. A blank title is stored as ''
  // (the column's own default), never invented.
  title: optionalText(200),
  slug: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9-]+$/, "Slug may contain lowercase letters, numbers and hyphens only"),
  ).optional(),
  description: z.string().trim().max(5000).default(""),
  // Category is optional — creating with no category leaves category_id
  // null rather than guessing one.
  category: optionalText(120),
  // Price is optional; when provided it must still be a real, non-negative
  // amount. An omitted price defaults to 0, matching discount/stock/rating
  // below, which already default to 0 for exactly this reason.
  price: optionalNumber(z.number().min(0, "Price cannot be negative").max(1_000_000)),
  // The `.default(0)` sits on the *inner* schema, not the preprocess
  // wrapper: ZodDefault only substitutes when the value it sees is
  // `undefined`, and it sees the value before preprocess runs. Nesting it
  // this way means an explicit "" (a cleared number input) is normalised to
  // undefined by the preprocess and only then hits the default — an outer
  // `.default()` would miss that case and fail validation instead.
  discount: z.preprocess(
    emptyToUndefined,
    z
      .number()
      .int()
      .min(0, "Discount cannot be negative")
      .max(100, "Discount cannot exceed 100")
      .default(0),
  ),
  stock: z.preprocess(
    emptyToUndefined,
    z
      .number()
      .int("Stock must be a whole number")
      .min(0, "Stock cannot be negative")
      .max(1_000_000)
      .default(0),
  ),
  rating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().min(0).default(0),
  isFeatured: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  hasGift: z.boolean().default(false),
  modelHeight: z.string().trim().max(60).nullable().optional(),
  modelWeight: z.string().trim().max(60).nullable().optional(),
  wearingSize: z.string().trim().max(30).nullable().optional(),
  images: z.array(imageInputSchema).max(12).default([]),
  sizes: z.array(sizeInputSchema).max(30).default([]),
  measurements: z.array(measurementInputSchema).max(30).default([]),
});

export const updateProductSchema = createProductSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Provide at least one field to update" },
);

// ---------------------------------------------------------------------------
// Accessories
// Separate from Products on purpose: no category, no sizes, no measurements.
// ---------------------------------------------------------------------------
export const accessorySortSchema = z.enum([
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "name_asc",
  "name_desc",
  "manual",
]);

export const accessoryQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  sort: accessorySortSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  featured: z.coerce.boolean().optional(),
  inStock: z.coerce.boolean().optional(),
  /**
   * Availability filter. The storefront omits it and gets available items
   * only; the admin panel passes `all` to see hidden ones too.
   */
  availability: z.enum(["available", "hidden", "all"]).optional(),
});

export type AccessoryQuery = z.infer<typeof accessoryQuerySchema>;

const accessoryImageInputSchema = z.object({
  imageUrl: z.string().trim().min(1).max(500),
  altText: z.string().trim().max(200).nullable().optional(),
});

export const createAccessorySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug may contain lowercase letters, numbers and hyphens only")
    .optional(),
  description: z.string().trim().max(5000).default(""),
  price: z.number().min(0, "Price cannot be negative").max(1_000_000),
  discount: z.number().int().min(0).max(100).default(0),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  images: z.array(accessoryImageInputSchema).max(12).default([]),
});

export const updateAccessorySchema = createAccessorySchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// ---------------------------------------------------------------------------
// Hero slides (homepage carousel)
// ---------------------------------------------------------------------------
/** Hero slides are addressed by UUID only — they have no slug. */
export const heroSlideIdParamSchema = z.object({
  id: z.string().trim().uuid("Invalid hero slide id"),
});

export const createHeroSlideSchema = z.object({
  // Either a Supabase Storage public URL returned by the shared product-image
  // upload endpoint, or a path served by the frontend.
  imageUrl: z.string().trim().min(1, "An image is required").max(500),
  eyebrowText: z.string().trim().max(120).default(""),
  heading: z.string().trim().min(1, "A heading is required").max(200),
  description: z.string().trim().max(600).default(""),
  buttonText: z.string().trim().max(60).default(""),
  buttonLink: z.string().trim().max(500).default("/shop"),
  displayOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().default(true),
  // Ends up in an inline style, so keep it to keywords, percentages and
  // lengths — no characters that could carry a second CSS declaration.
  objectPosition: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9%. -]+$/, "Use keywords or percentages, e.g. top or center 25%")
    .default("top"),
});

// ---------------------------------------------------------------------------
// Selected images (homepage Instagram marquee)
// ---------------------------------------------------------------------------
/** Selected images are addressed by UUID only — they have no slug. */
export const selectedImageIdParamSchema = z.object({
  id: z.string().trim().uuid("Invalid selected image id"),
});

/** Hosts a link may point at. Instagram serves both, www and bare. */
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

/**
 * The Instagram post this image links to, or null for "no link".
 *
 * Optional by design: a selected image always needs a picture, but not
 * necessarily a destination. Blank input — `""`, whitespace, or an explicit
 * null — normalises to null, so "no link" has exactly one representation in
 * the database rather than competing empty-string and NULL forms. A tile with
 * null links to the Vielinea homepage; that fallback is a storefront route,
 * not data, so it is not stored here.
 *
 * Whenever a value IS supplied it is validated strictly. Parsed with `URL`
 * rather than matched with a regex, because the thing that actually matters is
 * the protocol: a value like `javascript:alert(1)` or `data:text/html,...`
 * ends up in an href, and parsing is what reliably identifies those. Only
 * https on an Instagram host survives.
 *
 * Beyond that it is deliberately permissive — the path is not inspected, so
 * /p/, /reel/, /reels/, /tv/ and plain profile links all pass, as do the
 * tracking query strings Instagram's own share sheet appends.
 *
 * The parsed value is re-serialised, which lowercases the scheme and host and
 * percent-encodes anything unusual, so what reaches the database is already
 * normalised. There is no uniqueness check anywhere: several images sharing
 * one post URL is the normal case, not a mistake.
 */
const instagramUrlSchema = z
  .union([z.string(), z.null()])
  .transform((raw, ctx) => {
    const value = (raw ?? "").trim();
    // Blank is a valid answer — it means "no link", not a validation failure.
    if (value === "") return null;
    if (value.length > 500) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That link is too long" });
      return z.NEVER;
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a full Instagram link, e.g. https://www.instagram.com/p/XXXXXXXXXXX/",
      });
      return z.NEVER;
    }
    if (url.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The link must start with https://",
      });
      return z.NEVER;
    }
    if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The link must point to instagram.com",
      });
      return z.NEVER;
    }
    return url.toString();
  });

export const createSelectedImageSchema = z.object({
  // Either a Supabase Storage public URL returned by the shared product-image
  // upload endpoint, or a path served by the frontend. Required: a row with no
  // picture has nothing to render in the marquee.
  imageUrl: z.string().trim().min(1, "An image is required").max(500),
  // Optional. Omitted entirely, blank, or null all mean "no link".
  instagramUrl: instagramUrlSchema.optional().default(null),
  displayOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().default(true),
});

export const updateSelectedImageSchema = createSelectedImageSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------
/** FAQs are addressed by UUID only — they have no slug. */
export const faqIdParamSchema = z.object({
  id: z.string().trim().uuid("Invalid FAQ id"),
});

export const createFaqSchema = z.object({
  question: z.string().trim().min(1, "A question is required").max(300),
  // Plain text: the project has no rich-text editor, and the accordion renders
  // this as a text node so React escapes it.
  answer: z.string().trim().max(5000).default(""),
  displayOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().default(true),
});

export const updateFaqSchema = createFaqSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// ---------------------------------------------------------------------------
// Company timeline (About page)
// ---------------------------------------------------------------------------
/** Timeline entries are addressed by UUID only — they have no slug. */
export const timelineIdParamSchema = z.object({
  id: z.string().trim().uuid("Invalid timeline entry id"),
});

export const createTimelineEntrySchema = z.object({
  // Text rather than a number: "2002", "2015-2018" and "Today" are all valid
  // labels for a milestone.
  year: z.string().trim().min(1, "A year is required").max(40),
  title: z.string().trim().min(1, "A title is required").max(200),
  description: z.string().trim().max(2000).default(""),
  // Optional throughout: an entry with no image renders without one.
  imageUrl: z.string().trim().max(500).nullable().optional(),
  displayOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().default(true),
});

export const updateTimelineEntrySchema = createTimelineEntrySchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const updateHeroSlideSchema = createHeroSlideSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------
export const addToCartSchema = z.object({
  productId: idOrSlugSchema,
  size: z.string().trim().min(1).max(30).default("One Size"),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});

export const updateCartItemSchema = z.object({
  size: z.string().trim().min(1).max(30).default("One Size"),
  quantity: z.coerce.number().int().min(0).max(99),
});

export const cartItemQuerySchema = z.object({
  size: z.string().trim().min(1).max(30).optional(),
});

/** Adopts a guest's local cart into their account on sign-in. */
export const mergeCartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: idOrSlugSchema,
        size: z.string().trim().min(1).max(30).default("One Size"),
        quantity: z.coerce.number().int().min(1).max(99).default(1),
      }),
    )
    .max(100)
    .default([]),
});

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------
export const addToWishlistSchema = z.object({
  productId: idOrSlugSchema,
});

export const moveToCartSchema = z.object({
  productId: idOrSlugSchema,
  size: z.string().trim().min(1).max(30).optional(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});

/** Adopts a guest's local wishlist into their account on sign-in. */
export const mergeWishlistSchema = z.object({
  productIds: z.array(idOrSlugSchema).max(200).default([]),
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export const paymentMethodSchema = z.enum(["card", "cod"]);

/**
 * What the browser may send about a card, and nothing more.
 *
 * The provider's client-side SDK tokenizes the card and hands back this
 * descriptor. There is deliberately no field for the card number or the CVV —
 * neither reaches the API, so neither can be logged or stored. `.strict()`
 * means a client that tries to smuggle one in is rejected outright rather
 * than having it silently dropped.
 */
export const cardTokenSchema = z
  .object({
    token: z.string().trim().min(8, "Invalid payment token").max(255),
    brand: z.string().trim().min(2).max(40),
    last4: z.string().trim().regex(/^[0-9]{4}$/, "Invalid card details"),
    expiryMonth: z.coerce.number().int().min(1).max(12),
    expiryYear: z.coerce.number().int().min(2000).max(2100),
  })
  .strict();

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(2, "Full name is required").max(160),
  email: emailSchema,
  phone: z.string().trim().min(5, "Phone number is required").max(40),
  address: z.string().trim().min(5, "Address is required").max(400),
  city: z.string().trim().min(2, "City is required").max(120),
  postalCode: z.string().trim().max(30).optional(),
  country: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  // Which payment route to take. Anything outside this set is rejected with a
  // 422 before the order is built. Defaults to "card" so existing clients that
  // send no payment method keep the behaviour they have always had.
  paymentMethod: paymentMethodSchema.default("card"),
  /**
   * Required when paying by card, ignored entirely for Cash on Delivery. The
   * server decides what to do with it — a COD order never reaches the payment
   * provider no matter what a client sends here.
   */
  card: cardTokenSchema.optional(),
  /**
   * Stable for one checkout attempt so a retry, a double-click or a dropped
   * response cannot charge the customer twice.
   */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const orderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
export const createReviewSchema = z.object({
  rating: z.coerce
    .number()
    .int("Rating must be a whole number")
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5"),
  comment: z.string().trim().min(3, "Please write at least a few words").max(2000),
  authorName: z.string().trim().min(2).max(120).optional(),
  authorEmail: emailSchema.optional(),
});

export const reviewQuerySchema = z.object({
  sort: z.enum(["newest", "oldest", "highest", "lowest", "helpful"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const orderStatusSchema = z.enum([
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

export const updateOrderStatusSchema = z.object({ status: orderStatusSchema });

export const paymentStatusSchema = z.enum(["pending", "paid"]);

export const updatePaymentStatusSchema = z.object({ paymentStatus: paymentStatusSchema });

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: orderStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

// ---------------------------------------------------------------------------
// Contact + newsletter
// ---------------------------------------------------------------------------
export const contactSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: emailSchema,
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(5000),
});

export const newsletterSchema = z.object({
  email: emailSchema,
  source: z.string().trim().max(60).optional(),
});

// ---------------------------------------------------------------------------
// Live chat
// ---------------------------------------------------------------------------
// The 2000-character cap keeps a pg_notify payload (which carries the body)
// inside PostgreSQL's 8000-byte limit — see supabase/migrations/0006_live_chat.sql.
export const chatMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(2000, "Message is too long (2000 characters maximum)"),
});

export const startConversationSchema = z.object({
  subject: z.string().trim().max(200).optional(),
});

export const chatConversationQuerySchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
});

export const chatIdParamSchema = z.object({ id: z.string().uuid("Malformed conversation id") });
export const chatMessageIdParamSchema = z.object({ id: z.string().uuid("Malformed message id") });
