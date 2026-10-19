/**
 * Admin FAQ management, backed by the Express API (Supabase).
 *
 * Three distinct controls, following the Company Timeline precedent:
 *
 *   - `setEnabled` flips the whole section on or off. It writes to the CMS
 *     `faq` section's visibility through the existing
 *     PUT /admin/site/sections/:id, because that is already the project's
 *     mechanism for "does this section appear". It never touches a question,
 *     so switching the section off hides it on both pages that render it and
 *     switching it back on restores exactly what was there.
 *   - `saveHeader` edits the eyebrow / heading / description, stored on that
 *     same CMS section.
 *   - `update(id, { isActive })` hides one question. Different scope.
 */
import { apiClient, adminKeys, runAdminMutation, useAdminRecord } from "../lib/api-hooks";
import { faqKeys } from "@/services/faqs";
import type { ApiFaq, ApiFaqPayload } from "@/lib/api/types";

export interface AdminFaq {
  id: string;
  question: string;
  answer: string;
  displayOrder: number;
  isActive: boolean;
}

export type FaqDraft = Omit<AdminFaq, "id" | "displayOrder">;

function toAdminFaq(api: ApiFaq): AdminFaq {
  return {
    id: api.id,
    question: api.question,
    answer: api.answer,
    displayOrder: api.displayOrder,
    isActive: api.isActive,
  };
}

/** Every cache showing FAQ content: the admin screen, /faq and the About page. */
const FAQ_CACHES = [adminKeys.faqs, faqKeys.all];

export const faqsService = {
  create(input: FaqDraft): void {
    runAdminMutation(() => apiClient.post("/faqs", input), {
      invalidate: FAQ_CACHES,
      success: "FAQ created",
      failure: "Could not create the FAQ",
    });
  },

  update(id: string, patch: Partial<AdminFaq>): void {
    const body: Record<string, unknown> = {};
    if (patch.question !== undefined) body["question"] = patch.question;
    if (patch.answer !== undefined) body["answer"] = patch.answer;
    if (patch.displayOrder !== undefined) body["displayOrder"] = patch.displayOrder;
    if (patch.isActive !== undefined) body["isActive"] = patch.isActive;

    if (Object.keys(body).length === 0) return;

    runAdminMutation(() => apiClient.put(`/faqs/${id}`, body), {
      invalidate: FAQ_CACHES,
      success: "FAQ updated",
      failure: "Could not update the FAQ",
    });
  },

  remove(id: string): void {
    runAdminMutation(() => apiClient.delete(`/faqs/${id}`), {
      invalidate: FAQ_CACHES,
      success: "FAQ deleted",
      failure: "Could not delete the FAQ",
    });
  },

  /** Turns the whole section on or off. No question is read or written. */
  setEnabled(sectionId: string, enabled: boolean): void {
    runAdminMutation(
      () => apiClient.put(`/admin/site/sections/${sectionId}`, { isVisible: enabled }),
      {
        invalidate: FAQ_CACHES,
        success: enabled ? "FAQ section shown" : "FAQ section hidden",
        failure: "Could not change the FAQ visibility",
      },
    );
  },

  /** Saves the section header, on the same CMS section as the switch. */
  saveHeader(
    sectionId: string,
    header: { eyebrow: string; heading: string; description: string },
  ): void {
    runAdminMutation(
      () =>
        apiClient.put(`/admin/site/sections/${sectionId}`, {
          subtitle: header.eyebrow,
          title: header.heading,
          content: header.description,
        }),
      {
        invalidate: FAQ_CACHES,
        success: "FAQ header saved",
        failure: "Could not save the FAQ header",
      },
    );
  },

  /** Swaps display_order with the neighbouring FAQ, like the other reorders. */
  reorder(id: string, dir: -1 | 1): void {
    runAdminMutation(
      async () => {
        const rows = (await apiClient.get<ApiFaqPayload>("/faqs/all")).faqs.map(toAdminFaq);
        const index = rows.findIndex((f) => f.id === id);
        const swapIndex = index + dir;
        if (index < 0 || swapIndex < 0 || swapIndex >= rows.length) return;

        const current = rows[index]!;
        const neighbour = rows[swapIndex]!;

        // display_order carries no unique constraint, so the two rows may hold
        // the same value between these writes without erroring.
        await apiClient.put(`/faqs/${current.id}`, { displayOrder: neighbour.displayOrder });
        await apiClient.put(`/faqs/${neighbour.id}`, { displayOrder: current.displayOrder });
      },
      { invalidate: FAQ_CACHES, failure: "Could not reorder the FAQs" },
    );
  },

  key: "admin-faqs",
};

export interface AdminFaqView {
  enabled: boolean;
  sectionId: string | null;
  eyebrow: string;
  heading: string;
  description: string;
  faqs: AdminFaq[];
}

const EMPTY_VIEW: AdminFaqView = {
  enabled: false,
  sectionId: null,
  eyebrow: "",
  heading: "",
  description: "",
  faqs: [],
};

/**
 * The admin screen needs the switch, the header and the questions together,
 * and the endpoint returns them in one object — so this uses the
 * single-record helper rather than the list one.
 */
export function useAdminFaqs(): AdminFaqView {
  return useAdminRecord<ApiFaqPayload, AdminFaqView>(
    adminKeys.faqs,
    "/faqs/all",
    (data) => ({
      enabled: data.enabled,
      sectionId: data.section?.sectionId ?? null,
      // The CMS stores these as subtitle/title/content; the admin screen and
      // the storefront both speak in eyebrow/heading/description.
      eyebrow: data.section?.subtitle ?? "",
      heading: data.section?.title ?? "",
      description: data.section?.content ?? "",
      faqs: (data.faqs ?? []).map(toAdminFaq),
    }),
    EMPTY_VIEW,
  );
}
