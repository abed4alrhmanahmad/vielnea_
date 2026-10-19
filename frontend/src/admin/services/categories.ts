/**
 * Admin category management, backed by the Express API (Supabase).
 * Export shape is unchanged from the previous localStorage service.
 */
import { apiClient, adminKeys, runAdminMutation, useAdminList } from "../lib/api-hooks";
import type { ApiCategory } from "@/lib/api/types";

export interface AdminCategory {
  id: string;
  key: string;
  label: string;
  imageUrl: string;
  enabled: boolean;
  order: number;
  productCount?: number;
}

function toAdminCategory(api: ApiCategory): AdminCategory {
  return {
    id: api.id,
    key: api.slug,
    label: api.label,
    imageUrl: api.imageUrl ?? "",
    // Every category in the database is live; the flag is retained because the
    // existing admin UI renders a toggle for it.
    enabled: true,
    order: api.sortOrder,
    productCount: api.productCount ?? 0,
  };
}

export const categoriesService = {
  list(): AdminCategory[] {
    return [];
  },

  async fetch(): Promise<AdminCategory[]> {
    const rows = await apiClient.get<ApiCategory[]>("/categories");
    return rows.map(toAdminCategory);
  },

  create(input: Omit<AdminCategory, "id" | "order">): void {
    runAdminMutation(
      () =>
        apiClient.post("/admin/categories", {
          label: input.label,
          slug: input.key || undefined,
          imageUrl: input.imageUrl || null,
        }),
      {
        invalidate: [adminKeys.categories, ["categories"], ["products"]],
        success: "Category created",
        failure: "Could not create the category",
      },
    );
  },

  update(id: string, patch: Partial<AdminCategory>): void {
    const body: Record<string, unknown> = {};
    if (patch.label !== undefined) body["label"] = patch.label;
    if (patch.key !== undefined) body["slug"] = patch.key;
    if (patch.imageUrl !== undefined) body["imageUrl"] = patch.imageUrl || null;
    if (patch.order !== undefined) body["sortOrder"] = patch.order;

    if (Object.keys(body).length === 0) return;

    runAdminMutation(() => apiClient.put(`/admin/categories/${id}`, body), {
      invalidate: [adminKeys.categories, ["categories"], ["products"]],
      success: "Category updated",
      failure: "Could not update the category",
    });
  },

  remove(id: string): void {
    runAdminMutation(() => apiClient.delete(`/admin/categories/${id}`), {
      invalidate: [adminKeys.categories, ["categories"], ["products"]],
      success: "Category deleted",
      failure: "Could not delete the category",
    });
  },

  /**
   * Swaps sort_order with the neighbouring category. Reads the current order
   * first so the two updates are based on live data.
   */
  reorder(id: string, dir: -1 | 1): void {
    runAdminMutation(
      async () => {
        const rows = (await apiClient.get<ApiCategory[]>("/categories")).map(toAdminCategory);
        const index = rows.findIndex((c) => c.id === id);
        const swapIndex = index + dir;
        if (index < 0 || swapIndex < 0 || swapIndex >= rows.length) return;

        const current = rows[index]!;
        const neighbour = rows[swapIndex]!;

        await apiClient.put(`/admin/categories/${current.id}`, { sortOrder: neighbour.order });
        await apiClient.put(`/admin/categories/${neighbour.id}`, { sortOrder: current.order });
      },
      {
        invalidate: [adminKeys.categories, ["categories"]],
        failure: "Could not reorder the categories",
      },
    );
  },

  key: "admin-categories",
};

export function useCategories(): AdminCategory[] {
  return useAdminList<ApiCategory, AdminCategory>(adminKeys.categories, "/categories", (rows) =>
    rows.map(toAdminCategory),
  );
}
