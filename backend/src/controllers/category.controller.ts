import { asyncHandler, sendData } from "../lib/http.js";
import { categoryRepository } from "../repositories/category.repository.js";
import { NotFoundError } from "../lib/errors.js";
import { idParamSchema } from "../schemas/index.js";
import { cached, invalidateCache } from "../lib/cache.js";

const LIST_CACHE_KEY = "categories:list";
// Every category-bearing page (homepage, shop, admin filters) reads this on
// every visit; the database is remote, so this avoids paying that round
// trip on every request. admin.controller.ts calls invalidateCategoriesCache()
// after a create/update/delete, so this TTL is only a safety net and can be
// long — freshness comes from the invalidation, not from expiry.
const LIST_CACHE_TTL_MS = 5 * 60_000;

export function invalidateCategoriesCache(): void {
  invalidateCache(LIST_CACHE_KEY);
}

export const categoryController = {
  list: asyncHandler(async (_req, res) => {
    const categories = await cached(LIST_CACHE_KEY, LIST_CACHE_TTL_MS, () => categoryRepository.findAll());
    sendData(res, categories);
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const category = await categoryRepository.findByIdOrSlug(id);
    if (!category) throw new NotFoundError("Category not found");
    sendData(res, category);
  }),
};
