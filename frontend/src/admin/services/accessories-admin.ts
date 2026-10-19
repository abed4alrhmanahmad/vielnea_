/**
 * Admin accessory management, backed by the Express API (Supabase).
 *
 * Deliberately separate from `products-admin.ts`: accessories are their own
 * table and their own endpoint, and nothing here touches products, categories
 * or the product caches.
 *
 * The shape mirrors the product service — a hook returning a plain array and
 * fire-and-forget mutations that toast their own result — so the admin
 * accessories screen reads exactly like the products screen.
 */
import { apiClient, adminKeys, runAdminMutation, useAdminList } from "../lib/api-hooks";
import { prepareImageForUpload } from "../lib/image-prepare";
import { API_BASE_URL, ApiError, getToken } from "@/lib/api/client";
import type { ApiAccessory } from "@/lib/api/types";

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
 * to the accessory's image list exactly like a pasted URL. Sent as raw bytes
 * rather than base64 inside the JSON payload, which would blow the API's 100kb
 * body limit.
 */
export async function uploadAccessoryImage(file: File): Promise<string> {
  if (!isPlausibleImage(file)) {
    throw new ApiError("Choose a JPG, JPEG, PNG, WEBP, GIF, AVIF or SVG image.", 400);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(
      `This image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Images must be ${MAX_IMAGE_MB} MB or smaller.`,
      413,
    );
  }

  // Same capping as product images — see `prepareImageForUpload`. Accessory
  // cards render at the identical card size, so an uncapped upload here cost
  // exactly as much as it did on the shop grid.
  const upload = await prepareImageForUpload(file);

  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/accessories/images`, {
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

/** One accessory as the admin screen edits it. */
export interface AdminAccessory {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  finalPrice: number;
  stock: number;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AccessoryDraft {
  name: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  images: string[];
}

function toAdminAccessory(api: ApiAccessory): AdminAccessory {
  return {
    id: api.id,
    slug: api.slug,
    name: api.name,
    description: api.description,
    price: api.price,
    discount: api.discount,
    finalPrice: api.finalPrice,
    stock: api.stock,
    isAvailable: api.isAvailable,
    isFeatured: api.isFeatured,
    sortOrder: api.sortOrder,
    images: api.images,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
  };
}

/**
 * Coerces a form value to a number, clamped into the range the API accepts.
 * A blank input yields NaN, which JSON.stringify serialises as `null` — the
 * server then rejects it with an opaque "Expected number, received null".
 */
function toNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Maps the admin form shape onto the API's create/update payload. */
function toApiPayload(input: Partial<AccessoryDraft>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined) payload["name"] = input.name;
  if (input.description !== undefined) payload["description"] = input.description;
  if (input.price !== undefined) payload["price"] = toNumber(input.price, 0, 0, 1_000_000);
  if (input.discount !== undefined) {
    payload["discount"] = Math.round(toNumber(input.discount, 0, 0, 100));
  }
  if (input.stock !== undefined) {
    payload["stock"] = Math.round(toNumber(input.stock, 0, 0, 1_000_000));
  }
  if (input.isAvailable !== undefined) payload["isAvailable"] = Boolean(input.isAvailable);
  if (input.isFeatured !== undefined) payload["isFeatured"] = Boolean(input.isFeatured);
  if (input.sortOrder !== undefined) {
    payload["sortOrder"] = Math.round(toNumber(input.sortOrder, 0, 0, 100_000));
  }

  if (input.images) {
    payload["images"] = input.images
      // Blank slots would be rejected by the API's min-length rule.
      .filter((imageUrl) => typeof imageUrl === "string" && imageUrl.trim().length > 0)
      .map((imageUrl) => ({ imageUrl, altText: input.name ?? null }));
  }

  return payload;
}

/**
 * Caches to refresh after a write: the admin list and the storefront
 * accessories page. Product caches are deliberately absent — nothing here
 * changes a product.
 */
const ACCESSORY_CACHES = [adminKeys.accessories, ["accessories"]];

export const accessoriesService = {
  async fetch(): Promise<AdminAccessory[]> {
    const rows = await apiClient.get<ApiAccessory[]>("/accessories", {
      params: { limit: 60, availability: "all" },
    });
    return rows.map(toAdminAccessory);
  },

  create(input: AccessoryDraft): void {
    runAdminMutation(() => apiClient.post("/accessories", toApiPayload(input)), {
      invalidate: ACCESSORY_CACHES,
      success: "Accessory created",
      failure: "Could not create the accessory",
    });
  },

  update(idOrSlug: string, patch: Partial<AccessoryDraft>): void {
    runAdminMutation(
      () => apiClient.put(`/accessories/${encodeURIComponent(idOrSlug)}`, toApiPayload(patch)),
      {
        invalidate: ACCESSORY_CACHES,
        success: "Accessory updated",
        failure: "Could not update the accessory",
      },
    );
  },

  remove(idOrSlug: string): void {
    runAdminMutation(() => apiClient.delete(`/accessories/${encodeURIComponent(idOrSlug)}`), {
      invalidate: ACCESSORY_CACHES,
      success: "Accessory deleted",
      failure: "Could not delete the accessory",
    });
  },

  key: "admin-accessories",
};

/** Every accessory, hidden ones included — this is the management view. */
export function useAdminAccessories(): AdminAccessory[] {
  return useAdminList<ApiAccessory, AdminAccessory>(
    adminKeys.accessories,
    "/accessories?limit=60&availability=all",
    (rows) => rows.map(toAdminAccessory),
  );
}
