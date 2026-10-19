/**
 * Admin product management, backed by the Express API (Supabase).
 *
 * The exported shape is unchanged from the previous localStorage service, so
 * the admin product and inventory screens consume it exactly as before.
 */
import { apiClient, adminKeys, runAdminMutation, useAdminList } from "../lib/api-hooks";
import { prepareImageForUpload } from "../lib/image-prepare";
import { API_BASE_URL, ApiError, getToken } from "@/lib/api/client";
import { toStoreProduct } from "@/lib/api/mappers";
import type { ApiProduct } from "@/lib/api/types";
import type { Product, Category } from "@/data/products";

/** Image formats the storefront renders, matched by the upload endpoint. */
export const UPLOADABLE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
];

/**
 * Extensions accepted alongside the MIME list. Browsers derive `file.type`
 * from the extension and report "" for anything they do not recognise, so the
 * picker needs both to reliably offer every supported format.
 */
export const UPLOADABLE_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".svg",
];

/** What the file picker filters on. */
export const UPLOAD_ACCEPT_ATTRIBUTE = [
  ...UPLOADABLE_IMAGE_TYPES,
  ...UPLOADABLE_IMAGE_EXTENSIONS,
].join(",");

/**
 * The browser's `file.type` is a guess based on the filename, so it is used
 * only to filter obvious non-images. Anything image-shaped is sent through and
 * the server decides from the actual bytes; an unclassified file goes up as
 * octet-stream rather than being blocked here.
 */
function uploadContentType(file: File): string {
  if (UPLOADABLE_IMAGE_TYPES.includes(file.type)) return file.type;
  return "application/octet-stream";
}

/**
 * Upload cap, mirroring MAX_IMAGE_BYTES on the server. Checked here purely so
 * an oversized file fails instantly instead of after a long upload; the server
 * still enforces the real limit.
 */
export const MAX_IMAGE_MB = 15;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

/** Rejects only files that are clearly not images, by type and extension. */
function isPlausibleImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (file.type !== "") return false;
  const name = file.name.toLowerCase();
  return UPLOADABLE_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Stores one selected file and returns its public URL, which the caller adds
 * to the product's image list exactly like a pasted URL. Sent as raw bytes
 * rather than base64 in the product payload, which used to blow the API's
 * 100kb JSON body limit.
 */
export async function uploadProductImage(file: File): Promise<string> {
  if (!isPlausibleImage(file)) {
    throw new ApiError("Choose a JPG, JPEG, PNG, WEBP, GIF, AVIF or SVG image.", 400);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(
      `This image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Images must be ${MAX_IMAGE_MB} MB or smaller.`,
      413,
    );
  }

  // Capped and re-encoded before it leaves the browser. Storage serves the
  // stored bytes verbatim — image transformations are not enabled on this
  // project — so this is the only chance to stop a 32MP camera file from
  // becoming what every storefront visitor downloads. Falls back to the
  // original file on any unsupported browser or decode failure, and the
  // validation above still ran against what the admin actually picked.
  const upload = await prepareImageForUpload(file);

  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/products/images`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": uploadContentType(upload),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: upload,
  });

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: { url?: string };
  } | null;

  if (!response.ok || payload?.success === false || !payload?.data?.url) {
    throw new ApiError(payload?.message ?? "Could not upload the image.", response.status);
  }
  return payload.data.url;
}

export interface AdminProduct extends Product {
  /** Real primary key; `id` stays the slug so existing links keep working. */
  uuid: string;
  slug: string;
  featured?: boolean;
  published?: boolean;
  mainImageIndex?: number;
  measurementsBySize?: Record<string, Record<string, string>>;
  categoryLabel?: string;
  sizeStock?: Record<string, number>;
}

function toAdminProduct(api: ApiProduct): AdminProduct {
  const base = toStoreProduct(api);
  return {
    ...base,
    featured: api.isFeatured,
    published: true,
    mainImageIndex: 0,
    measurementsBySize: Object.fromEntries(api.measurementDetails.map((m) => [m.size, m.labels])),
  };
}

/**
 * Coerces a form value to a number, clamped into the range the API accepts.
 * Used only for `rating`/`reviewCount`, which the form always sends a real
 * computed value for (never a blank the admin typed) — see `numericEntry`
 * below for the optional Price/Discount/Stock fields, which must NOT be
 * silently clamped: an out-of-range value there is supposed to be rejected
 * by the API, not quietly rewritten into range.
 */
function toNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Price/Discount/Stock are optional: the form field can be blank (`""`).
 * Blank (or otherwise non-numeric) means "omit this key" — the API then
 * either defaults it (create) or leaves the product's existing value alone
 * (update) — never that it means 0. A real number is passed through
 * unrounded/unclamped so the API's own validation is what rejects a
 * negative price, an out-of-range discount, or a decimal stock count, with
 * a real error message instead of the value being silently coerced.
 */
function numericEntry(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Maps the admin form shape onto the API's create/update payload. */
function toApiPayload(input: Partial<AdminProduct>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.title !== undefined) payload["title"] = input.title;
  if (input.description !== undefined) payload["description"] = input.description;
  if (input.category !== undefined) payload["category"] = input.category;
  if (input.price !== undefined) {
    const price = numericEntry(input.price);
    if (price !== undefined) payload["price"] = price;
  }
  if (input.discount !== undefined) {
    const discount = numericEntry(input.discount);
    if (discount !== undefined) payload["discount"] = discount;
  }
  if (input.stock !== undefined) {
    const stock = numericEntry(input.stock);
    if (stock !== undefined) payload["stock"] = stock;
  }
  if (input.rating !== undefined) payload["rating"] = toNumber(input.rating, 0, 0, 5);
  if (input.reviewCount !== undefined) {
    payload["reviewCount"] = Math.round(toNumber(input.reviewCount, 0, 0, 1_000_000));
  }
  if (input.isNew !== undefined) payload["isNewArrival"] = Boolean(input.isNew);
  if (input.isBestSeller !== undefined) payload["isBestSeller"] = Boolean(input.isBestSeller);
  if (input.hasGift !== undefined) payload["hasGift"] = Boolean(input.hasGift);
  if (input.featured !== undefined) payload["isFeatured"] = Boolean(input.featured);

  if (input.model) {
    payload["modelHeight"] = input.model.height || null;
    payload["modelWeight"] = input.model.weight || null;
    payload["wearingSize"] = input.model.wearingSize || null;
  }

  if (input.images) {
    payload["images"] = input.images
      // Blank slots would be rejected by the API's min-length rule.
      .filter((imageUrl) => typeof imageUrl === "string" && imageUrl.trim().length > 0)
      .map((imageUrl) => ({
        // Dev-server paths (/src/assets/...) resolve under `vite dev` but 404 in
        // a production build; store the public path instead.
        imageUrl: imageUrl.replace("/src/assets/", "/images/products/"),
        altText: input.title ?? null,
      }));
  }

  if (input.sizes) {
    // Spread the product stock across sizes when per-size figures are absent,
    // mirroring how the catalogue was seeded.
    const total = Math.round(Number(input.stock ?? 0));
    const count = input.sizes.length;
    const base = count > 0 ? Math.floor(total / count) : 0;
    const remainder = count > 0 ? total % count : 0;

    payload["sizes"] = input.sizes.map((size, i) => ({
      size,
      stock: input.sizeStock?.[size] ?? base + (i < remainder ? 1 : 0),
    }));
  }

  if (input.measurements) {
    // The API caps label keys and values at 60 characters each. Blank rows
    // are dropped rather than kept as empty strings — measurements are
    // optional, so a field left blank produces no row at all, not a row of
    // empty values.
    const labels: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.measurements)) {
      const v = String(value ?? "").trim();
      if (!v) continue;
      labels[key.slice(0, 60)] = v.slice(0, 60);
    }
    // Nothing entered — send no measurements row at all, rather than one
    // keyed to an invented "M" when Model wearing size is also blank.
    if (Object.keys(labels).length > 0) {
      payload["measurements"] = [{ size: input.model?.wearingSize || "One Size", labels }];
    }
  }

  return payload;
}

export const productsService = {
  /**
   * Kept for API compatibility with the previous synchronous service. Screens
   * read products through `useAdminProducts()`; this returns an empty list
   * rather than stale localStorage data.
   */
  list(): AdminProduct[] {
    return [];
  },

  async fetch(): Promise<AdminProduct[]> {
    const rows = await apiClient.get<ApiProduct[]>("/products", { params: { limit: 60 } });
    return rows.map(toAdminProduct);
  },

  async getAsync(idOrSlug: string): Promise<AdminProduct | undefined> {
    try {
      const row = await apiClient.get<ApiProduct>(`/products/${encodeURIComponent(idOrSlug)}`);
      return toAdminProduct(row);
    } catch {
      return undefined;
    }
  },

  get(): AdminProduct | undefined {
    return undefined;
  },

  create(input: Omit<AdminProduct, "id" | "uuid" | "slug">): void {
    runAdminMutation(
      () => apiClient.post("/products", toApiPayload(input as Partial<AdminProduct>)),
      {
        invalidate: [adminKeys.products, adminKeys.stats, ["products"]],
        success: "Product created",
        failure: "Could not create the product",
      },
    );
  },

  update(idOrSlug: string, patch: Partial<AdminProduct>): void {
    runAdminMutation(
      () => apiClient.put(`/products/${encodeURIComponent(idOrSlug)}`, toApiPayload(patch)),
      {
        invalidate: [adminKeys.products, adminKeys.stats, ["products"]],
        success: "Product updated",
        failure: "Could not update the product",
      },
    );
  },

  remove(idOrSlug: string): void {
    runAdminMutation(() => apiClient.delete(`/products/${encodeURIComponent(idOrSlug)}`), {
      invalidate: [adminKeys.products, adminKeys.stats, ["products"]],
      success: "Product deleted",
      failure: "Could not delete the product",
    });
  },

  key: "admin-products",
};

export function useAdminProducts(): AdminProduct[] {
  return useAdminList<ApiProduct, AdminProduct>(adminKeys.products, "/products?limit=60", (rows) =>
    rows.map(toAdminProduct),
  );
}

export type { Category };
