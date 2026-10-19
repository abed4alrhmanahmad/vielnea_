import { asyncHandler, buildPagination, sendData, sendPaginated } from "../lib/http.js";
import { adminRepository } from "../repositories/admin.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import { categoryRepository } from "../repositories/category.repository.js";
import { invalidateCategoriesCache } from "./category.controller.js";
import { invalidateProductsCache } from "../services/product.service.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors.js";
import { isUuid, slugify } from "../utils/slug.js";
import {
  adminListQuerySchema,
  updateOrderStatusSchema,
  updatePaymentStatusSchema,
} from "../schemas/index.js";
import { z } from "zod";

const categoryBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug may contain lowercase letters, numbers and hyphens only")
    .optional(),
  label: z.string().trim().min(2, "Label is required").max(80),
  description: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
});

const categoryUpdateSchema = categoryBodySchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: "Provide at least one field to update" },
);

const reviewUpdateSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    comment: z.string().trim().min(1).max(2000).optional(),
    reported: z.boolean().optional(),
    status: z.enum(["pending", "approved", "hidden"]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

function requireUuid(value: string | undefined, label: string): string {
  if (!value || !isUuid(value)) throw new BadRequestError(`Malformed ${label} id`);
  return value;
}

export const adminController = {
  // --- dashboard ----------------------------------------------------------
  stats: asyncHandler(async (_req, res) => {
    const [stats, topProducts, revenueByDay] = await Promise.all([
      adminRepository.dashboardStats(),
      adminRepository.topProducts(5),
      adminRepository.revenueByDay(30),
    ]);
    sendData(res, { ...stats, topProducts, revenueByDay });
  }),

  // --- orders -------------------------------------------------------------
  listOrders: asyncHandler(async (req, res) => {
    const query = adminListQuerySchema.parse(req.query);
    const { orders, total } = await orderRepository.findAll(query.page, query.limit, {
      status: query.status,
      search: query.search,
    });
    sendPaginated(res, orders, buildPagination(total, query.page, query.limit));
  }),

  getOrder: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "order");
    const order = await orderRepository.findByIdAsAdmin(id);
    if (!order) throw new NotFoundError("Order not found");
    sendData(res, order);
  }),

  updateOrderStatus: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "order");
    const { status } = updateOrderStatusSchema.parse(req.body);
    const order = await orderRepository.updateStatus(id, status);
    if (!order) throw new NotFoundError("Order not found");
    sendData(res, order);
  }),

  /**
   * Settles a Cash-on-Delivery order once the courier has collected payment.
   * Only the payment state moves — the order's own status is left to
   * updateOrderStatus, so marking an order paid never ships it by accident.
   */
  updatePaymentStatus: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "order");
    const { paymentStatus } = updatePaymentStatusSchema.parse(req.body);
    const order = await orderRepository.updatePaymentStatus(id, paymentStatus);
    if (!order) throw new NotFoundError("Order not found");
    sendData(res, order);
  }),

  // --- notifications ------------------------------------------------------
  listNotifications: asyncHandler(async (_req, res) => {
    sendData(res, await adminRepository.notifications());
  }),

  // --- customers ----------------------------------------------------------
  listCustomers: asyncHandler(async (_req, res) => {
    sendData(res, await adminRepository.customers());
  }),

  // --- reviews ------------------------------------------------------------
  listReviews: asyncHandler(async (_req, res) => {
    sendData(res, await adminRepository.reviews());
  }),

  updateReview: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "review");
    const patch = reviewUpdateSchema.parse(req.body);
    const ok = await adminRepository.updateReview(id, patch);
    if (!ok) throw new NotFoundError("Review not found");
    // Hiding/unhiding moves the product's rating aggregate, which listings show.
    invalidateProductsCache();
    sendData(res, { message: "Review updated" });
  }),

  deleteReview: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "review");
    const ok = await adminRepository.deleteReview(id);
    if (!ok) throw new NotFoundError("Review not found");
    invalidateProductsCache();
    sendData(res, { message: "Review deleted" });
  }),

  // --- categories ---------------------------------------------------------
  createCategory: asyncHandler(async (req, res) => {
    const input = categoryBodySchema.parse(req.body);
    const slug = input.slug ?? slugify(input.label);
    if (!slug) throw new BadRequestError("Could not derive a slug from the label");
    if (await categoryRepository.existsBySlug(slug)) {
      throw new ConflictError(`A category with the slug "${slug}" already exists`);
    }
    const category = await categoryRepository.create({ ...input, slug });
    invalidateCategoriesCache();
    sendData(res, category, 201);
  }),

  updateCategory: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "category");
    const input = categoryUpdateSchema.parse(req.body);

    if (input.slug) {
      const existing = await categoryRepository.findByIdOrSlug(input.slug);
      if (existing && existing.id !== id) {
        throw new ConflictError(`A category with the slug "${input.slug}" already exists`);
      }
    }

    const category = await categoryRepository.update(id, input);
    if (!category) throw new NotFoundError("Category not found");
    invalidateCategoriesCache();
    sendData(res, category);
  }),

  deleteCategory: asyncHandler(async (req, res) => {
    const id = requireUuid(req.params["id"], "category");

    // Products reference categories with ON DELETE RESTRICT; explain rather
    // than surfacing a foreign-key error.
    const inUse = await categoryRepository.productCount(id);
    if (inUse > 0) {
      throw new ConflictError(
        `This category still has ${inUse} product(s). Move or remove them first.`,
      );
    }

    const deleted = await categoryRepository.remove(id);
    if (!deleted) throw new NotFoundError("Category not found");
    invalidateCategoriesCache();
    sendData(res, { message: "Category deleted" });
  }),
};
