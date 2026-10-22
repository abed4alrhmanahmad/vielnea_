import {
  apiClient,
  adminKeys,
  runAdminMutation,
  useAdminList,
  useAdminRecord,
} from "../lib/api-hooks";

// ---------- Reviews ----------
// Backed by the reviews table via the Express API.
export type ReviewStatus = "pending" | "approved" | "hidden";
export interface Review {
  id: string;
  productId: string;
  productTitle: string;
  author: string;
  rating: number;
  body: string;
  status: ReviewStatus;
  verified: boolean;
  reported: boolean;
  createdAt: number;
}

interface ApiAdminReview {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  userId: string | null;
  authorName: string;
  authorEmail: string | null;
  rating: number;
  comment: string;
  verified: boolean;
  reported: boolean;
  status: ReviewStatus;
  helpfulCount: number;
  createdAt: string;
}

function toAdminReview(api: ApiAdminReview): Review {
  return {
    id: api.id,
    productId: api.productSlug,
    productTitle: api.productTitle,
    author: api.authorName,
    rating: api.rating,
    body: api.comment,
    status: api.status,
    verified: api.verified,
    reported: api.reported,
    createdAt: new Date(api.createdAt).getTime(),
  };
}

export const reviewsService = {
  list(): Review[] {
    return [];
  },

  async fetch(): Promise<Review[]> {
    const rows = await apiClient.get<ApiAdminReview[]>("/admin/reviews");
    return rows.map(toAdminReview);
  },

  update(id: string, patch: Partial<Review>): void {
    const body: Record<string, unknown> = {};
    if (patch.status !== undefined) body["status"] = patch.status;
    if (patch.rating !== undefined) body["rating"] = patch.rating;
    if (patch.body !== undefined) body["comment"] = patch.body;
    if (patch.reported !== undefined) body["reported"] = patch.reported;
    if (Object.keys(body).length === 0) return;

    runAdminMutation(() => apiClient.put(`/admin/reviews/${id}`, body), {
      invalidate: [adminKeys.reviews, adminKeys.stats, ["reviews"]],
      success: "Review updated",
      failure: "Could not update the review",
    });
  },

  remove(id: string): void {
    runAdminMutation(() => apiClient.delete(`/admin/reviews/${id}`), {
      invalidate: [adminKeys.reviews, adminKeys.stats, ["reviews"]],
      success: "Review deleted",
      failure: "Could not delete the review",
    });
  },

  key: "admin-reviews",
};

export function useReviews(): Review[] {
  return useAdminList<ApiAdminReview, Review>(adminKeys.reviews, "/admin/reviews", (rows) =>
    rows.map(toAdminReview),
  );
}
// ---------- Notifications ----------
// Derived on the server from real data — recent orders, low stock, unread
// contact messages and recent reviews. Nothing is stored or seeded client-side,
// so the list can never drift from the facts it describes.
export type NotifType = "order" | "stock" | "message" | "review";
export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

interface ApiNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  createdAt: string;
}

function toNotification(api: ApiNotification): Notification {
  return {
    id: api.id,
    type: api.type,
    title: api.title,
    body: api.body,
    // Derived notifications have no per-admin read state; treated as unread.
    read: false,
    createdAt: new Date(api.createdAt).getTime(),
  };
}

export const notificationsService = {
  list(): Notification[] {
    return [];
  },
  async fetch(): Promise<Notification[]> {
    const rows = await apiClient.get<ApiNotification[]>("/admin/notifications");
    return rows.map(toNotification);
  },
  /**
   * Derived notifications have no stored per-admin read state, so these are
   * accepted and ignored rather than removed — the buttons stay in the UI.
   */
  markRead(_id?: string): void {},
  markAllRead(): void {},
  remove(_id?: string): void {},
  key: "admin-notifications",
};

export function useNotifications(): Notification[] {
  return useAdminList<ApiNotification, Notification>(
    ["admin", "notifications"],
    "/admin/notifications",
    (rows) => rows.map(toNotification),
  );
}

// ---------- Media ----------
// Backed by the media_assets table. Only references (paths) are stored; no
// image bytes go into PostgreSQL and no existing file is ever modified.
export type MediaType = "product" | "hero" | "banner" | "category";
export interface MediaAsset {
  id: string;
  type: MediaType;
  name: string;
  url: string;
  createdAt: number;
}

interface ApiMediaAsset {
  id: string;
  type: MediaType;
  name: string;
  url: string;
  createdAt: string;
}

function toMedia(api: ApiMediaAsset): MediaAsset {
  return {
    id: api.id,
    type: api.type,
    name: api.name,
    url: api.url,
    createdAt: new Date(api.createdAt).getTime(),
  };
}

export const mediaService = {
  list(): MediaAsset[] {
    return [];
  },
  async fetch(): Promise<MediaAsset[]> {
    const rows = await apiClient.get<ApiMediaAsset[]>("/admin/site/media");
    return rows.map(toMedia);
  },
  add(input: Omit<MediaAsset, "id" | "createdAt">): void {
    runAdminMutation(() => apiClient.post("/admin/site/media", input), {
      invalidate: [["admin", "media"]],
      success: "Media added",
      failure: "Could not add the media asset",
    });
  },
  remove(id: string): void {
    runAdminMutation(() => apiClient.delete(`/admin/site/media/${id}`), {
      invalidate: [["admin", "media"]],
      success: "Media removed",
      failure: "Could not remove the media asset",
    });
  },
  key: "admin-media",
};

export function useMedia(): MediaAsset[] {
  return useAdminList<ApiMediaAsset, MediaAsset>(["admin", "media"], "/admin/site/media", (rows) =>
    rows.map(toMedia),
  );
}

// ---------- Store settings ----------
// Backed by the store_settings row plus the site_content documents. The
// shipping rate here is the one the server uses at checkout.
export interface StoreSettings {
  storeName: string;
  storeEmail: string;
  storePhone: string;
  storeAddress: string;
  currency: string;
  standardShipping: number;
  socialInstagram: string;
  socialFacebook: string;
  socialTwitter: string;
  adminName: string;
  adminEmail: string;
}

interface ApiSettingsPayload {
  store: Omit<StoreSettings, "adminName" | "adminEmail">;
  social?: { instagram?: string; facebook?: string; twitter?: string };
  contact?: { email?: string; phone?: string; address?: string };
  payment_methods?: { cardEnabled?: boolean; codEnabled?: boolean };
  cardPayments?: { ready?: boolean; provider?: string };
}

const SETTINGS_FALLBACK: StoreSettings = {
  storeName: "Vielinea",
  storeEmail: "",
  storePhone: "",
  storeAddress: "",
  currency: "USD",
  standardShipping: 15,
  socialInstagram: "",
  socialFacebook: "",
  socialTwitter: "",
  adminName: "Vielinea Admin",
  adminEmail: "",
};

function toSettings(api: ApiSettingsPayload): StoreSettings {
  return {
    ...SETTINGS_FALLBACK,
    ...api.store,
    socialInstagram: api.social?.instagram ?? "",
    socialFacebook: api.social?.facebook ?? "",
    socialTwitter: api.social?.twitter ?? "",
  };
}

export const settingsService = {
  get(): StoreSettings {
    return SETTINGS_FALLBACK;
  },
  async fetch(): Promise<StoreSettings> {
    return toSettings(await apiClient.get<ApiSettingsPayload>("/admin/site/settings"));
  },
  save(next: Partial<StoreSettings>): void {
    const store: Record<string, unknown> = {};
    for (const key of [
      "storeName",
      "storeEmail",
      "storePhone",
      "storeAddress",
      "currency",
      "standardShipping",
    ] as const) {
      if (next[key] !== undefined) store[key] = next[key];
    }

    runAdminMutation(
      async () => {
        if (Object.keys(store).length > 0) {
          await apiClient.put("/admin/site/settings/store", store);
        }
        if (
          next.socialInstagram !== undefined ||
          next.socialFacebook !== undefined ||
          next.socialTwitter !== undefined
        ) {
          await apiClient.put("/admin/site/settings/social", {
            value: {
              instagram: next.socialInstagram ?? "",
              facebook: next.socialFacebook ?? "",
              twitter: next.socialTwitter ?? "",
            },
          });
        }
      },
      {
        invalidate: [["admin", "site"], ["site"], ["admin", "settings"]],
        success: "Settings saved",
        failure: "Could not save the settings",
      },
    );
  },
  key: "admin-settings",
};

// ---------- Payment methods ----------
// The checkout switches, stored in site_content under "payment_methods" via
// the admin settings endpoint; the server enforces them at checkout.
export interface PaymentMethodSettings {
  cardEnabled: boolean;
  codEnabled: boolean;
  /** False when no real card processor is configured: card stays off at checkout. */
  cardReady: boolean;
  loaded: boolean;
}

const PAYMENT_METHODS_FALLBACK: PaymentMethodSettings = {
  cardEnabled: true,
  codEnabled: true,
  cardReady: false,
  loaded: false,
};

export function usePaymentMethodSettings(): PaymentMethodSettings {
  return useAdminRecord<ApiSettingsPayload, PaymentMethodSettings>(
    ["admin", "settings"],
    "/admin/site/settings",
    (api) => ({
      // Only an explicit false switches a method off, matching the server.
      cardEnabled: api.payment_methods?.cardEnabled !== false,
      codEnabled: api.payment_methods?.codEnabled !== false,
      cardReady: api.cardPayments?.ready === true,
      loaded: true,
    }),
    PAYMENT_METHODS_FALLBACK,
  );
}

export const paymentMethodsService = {
  save(next: { cardEnabled: boolean; codEnabled: boolean }): void {
    runAdminMutation(() => apiClient.put("/admin/site/settings/payment_methods", { value: next }), {
      invalidate: [["admin", "settings"], ["site"]],
      success: "Payment methods updated",
      failure: "Could not update payment methods",
    });
  },
};

export function useSettings(): StoreSettings {
  return useAdminRecord<ApiSettingsPayload, StoreSettings>(
    ["admin", "settings"],
    "/admin/site/settings",
    toSettings,
    SETTINGS_FALLBACK,
  );
}
