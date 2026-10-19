/**
 * Admin company-timeline management, backed by the Express API (Supabase).
 *
 * Two distinct controls live here:
 *
 *   - `setEnabled` flips the whole feature. It writes to the CMS `timeline`
 *     section's visibility through the existing PUT /admin/site/sections/:id,
 *     because that is already the project's mechanism for "does this section
 *     appear on this page". It never touches the entries, so switching the
 *     feature off hides the section and switching it back on restores exactly
 *     what was there.
 *   - `update(id, { isActive })` hides one milestone. Different control,
 *     different scope.
 *
 * Entry images reuse `uploadProductImage`: the same POST /products/images
 * endpoint and Supabase Storage bucket the catalogue and hero slides use.
 */
import { apiClient, adminKeys, runAdminMutation, useAdminRecord } from "../lib/api-hooks";
import { companyTimelineKeys } from "@/services/company-timeline";
import type { ApiCompanyTimeline, ApiTimelineEntry } from "@/lib/api/types";

export {
  uploadProductImage as uploadTimelineImage,
  UPLOADABLE_IMAGE_TYPES,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "./products-admin";

export interface AdminTimelineEntry {
  id: string;
  year: string;
  title: string;
  description: string;
  imageUrl: string;
  displayOrder: number;
  isActive: boolean;
}

export type TimelineDraft = Omit<AdminTimelineEntry, "id" | "displayOrder">;

function toAdminEntry(api: ApiTimelineEntry): AdminTimelineEntry {
  return {
    id: api.id,
    year: api.year,
    title: api.title,
    description: api.description,
    imageUrl: api.imageUrl ?? "",
    displayOrder: api.displayOrder,
    isActive: api.isActive,
  };
}

/** Every cache showing timeline content: the admin screen, the About page. */
const TIMELINE_CACHES = [adminKeys.timeline, companyTimelineKeys.all, ["site", "page", "about"]];

export const timelineService = {
  create(input: TimelineDraft): void {
    runAdminMutation(
      () => apiClient.post("/company-timeline", { ...input, imageUrl: input.imageUrl || null }),
      {
        invalidate: TIMELINE_CACHES,
        success: "Timeline entry created",
        failure: "Could not create the timeline entry",
      },
    );
  },

  update(id: string, patch: Partial<AdminTimelineEntry>): void {
    const body: Record<string, unknown> = {};
    if (patch.year !== undefined) body["year"] = patch.year;
    if (patch.title !== undefined) body["title"] = patch.title;
    if (patch.description !== undefined) body["description"] = patch.description;
    if (patch.imageUrl !== undefined) body["imageUrl"] = patch.imageUrl || null;
    if (patch.displayOrder !== undefined) body["displayOrder"] = patch.displayOrder;
    if (patch.isActive !== undefined) body["isActive"] = patch.isActive;

    if (Object.keys(body).length === 0) return;

    runAdminMutation(() => apiClient.put(`/company-timeline/${id}`, body), {
      invalidate: TIMELINE_CACHES,
      success: "Timeline entry updated",
      failure: "Could not update the timeline entry",
    });
  },

  remove(id: string): void {
    runAdminMutation(() => apiClient.delete(`/company-timeline/${id}`), {
      invalidate: TIMELINE_CACHES,
      success: "Timeline entry deleted",
      failure: "Could not delete the timeline entry",
    });
  },

  /**
   * Turns the whole section on or off. Writes only the CMS section's
   * visibility — no timeline entry is read, written or deleted here.
   */
  setEnabled(sectionId: string, enabled: boolean): void {
    runAdminMutation(
      () => apiClient.put(`/admin/site/sections/${sectionId}`, { isVisible: enabled }),
      {
        invalidate: TIMELINE_CACHES,
        success: enabled
          ? "Timeline shown on the About page"
          : "Timeline hidden from the About page",
        failure: "Could not change the timeline visibility",
      },
    );
  },

  /**
   * Saves the section header. Writes to the same CMS section the feature
   * switch uses, through the same existing PUT /admin/site/sections/:id — the
   * timeline entries are not touched.
   */
  saveHeader(
    sectionId: string,
    header: { eyebrowText: string; heading: string; description: string },
  ): void {
    runAdminMutation(
      () =>
        apiClient.put(`/admin/site/sections/${sectionId}`, {
          subtitle: header.eyebrowText,
          title: header.heading,
          content: header.description,
        }),
      {
        invalidate: TIMELINE_CACHES,
        success: "Timeline header saved",
        failure: "Could not save the timeline header",
      },
    );
  },

  /** Swaps display_order with the neighbouring entry, like the other reorders. */
  reorder(id: string, dir: -1 | 1): void {
    runAdminMutation(
      async () => {
        const rows = (await apiClient.get<ApiCompanyTimeline>("/company-timeline/all")).entries.map(
          toAdminEntry,
        );
        const index = rows.findIndex((e) => e.id === id);
        const swapIndex = index + dir;
        if (index < 0 || swapIndex < 0 || swapIndex >= rows.length) return;

        const current = rows[index]!;
        const neighbour = rows[swapIndex]!;

        // display_order carries no unique constraint, so the two rows may hold
        // the same value between these writes without erroring.
        await apiClient.put(`/company-timeline/${current.id}`, {
          displayOrder: neighbour.displayOrder,
        });
        await apiClient.put(`/company-timeline/${neighbour.id}`, {
          displayOrder: current.displayOrder,
        });
      },
      { invalidate: TIMELINE_CACHES, failure: "Could not reorder the timeline" },
    );
  },

  key: "admin-company-timeline",
};

export interface AdminTimelineView {
  enabled: boolean;
  sectionId: string | null;
  /** Section header copy, stored on the CMS `timeline` section. */
  eyebrowText: string;
  heading: string;
  description: string;
  entries: AdminTimelineEntry[];
}

const EMPTY_VIEW: AdminTimelineView = {
  enabled: false,
  sectionId: null,
  eyebrowText: "",
  heading: "",
  description: "",
  entries: [],
};

/**
 * The admin screen needs the feature switch and the entries together, and the
 * endpoint returns both in one object — so this uses the single-record helper
 * rather than the list one.
 */
export function useAdminTimeline(): AdminTimelineView {
  return useAdminRecord<ApiCompanyTimeline, AdminTimelineView>(
    adminKeys.timeline,
    "/company-timeline/all",
    (data) => ({
      enabled: data.enabled,
      sectionId: data.section?.sectionId ?? null,
      // The CMS stores these as subtitle/title/content; the admin screen and
      // the About page both speak in eyebrow/heading/description.
      eyebrowText: data.section?.subtitle ?? "",
      heading: data.section?.title ?? "",
      description: data.section?.content ?? "",
      entries: (data.entries ?? []).map(toAdminEntry),
    }),
    EMPTY_VIEW,
  );
}
