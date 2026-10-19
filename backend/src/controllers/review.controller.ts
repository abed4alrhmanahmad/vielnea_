import { asyncHandler, buildPagination, sendData, sendPaginated } from "../lib/http.js";
import { reviewService } from "../services/review.service.js";
import { requireUser } from "../middleware/auth.js";
import { createReviewSchema, productIdParamSchema, reviewQuerySchema } from "../schemas/index.js";
import { BadRequestError } from "../lib/errors.js";
import { isUuid } from "../utils/slug.js";

export const reviewController = {
  listForProduct: asyncHandler(async (req, res) => {
    const { productId } = productIdParamSchema.parse(req.params);
    const query = reviewQuerySchema.parse(req.query);
    // optionalAuthenticate means req.user is set for signed-in visitors only.
    const { reviews, stats, total } = await reviewService.listForProduct(
      productId,
      query.sort,
      query.page,
      query.limit,
      req.user?.sub,
    );
    sendPaginated(res, { reviews, stats }, buildPagination(total, query.page, query.limit));
  }),

  toggleHelpful: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const reviewId = req.params["reviewId"] ?? "";
    if (!isUuid(reviewId)) throw new BadRequestError("Malformed review id");
    sendData(res, await reviewService.toggleHelpful(reviewId, sub));
  }),

  report: asyncHandler(async (req, res) => {
    requireUser(req);
    const reviewId = req.params["reviewId"] ?? "";
    if (!isUuid(reviewId)) throw new BadRequestError("Malformed review id");
    await reviewService.report(reviewId);
    sendData(res, { message: "Thank you — our team will take a look." });
  }),

  remove: asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const reviewId = req.params["reviewId"] ?? "";
    if (!isUuid(reviewId)) throw new BadRequestError("Malformed review id");
    await reviewService.remove(reviewId, user.sub, user.role === "admin");
    sendData(res, { message: "Review deleted" });
  }),

  create: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { productId } = productIdParamSchema.parse(req.params);
    const input = createReviewSchema.parse(req.body);
    const review = await reviewService.create(sub, productId, input);
    sendData(res, review, 201);
  }),
};
