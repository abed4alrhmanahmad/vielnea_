import { asyncHandler, sendData } from "../lib/http.js";
import { wishlistService } from "../services/wishlist.service.js";
import { requireUser } from "../middleware/auth.js";
import {
  addToWishlistSchema,
  idParamSchema,
  mergeWishlistSchema,
  moveToCartSchema,
} from "../schemas/index.js";

export const wishlistController = {
  get: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    sendData(res, await wishlistService.get(sub));
  }),

  add: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { productId } = addToWishlistSchema.parse(req.body);
    sendData(res, await wishlistService.add(sub, productId), 201);
  }),

  toggle: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { productId } = addToWishlistSchema.parse(req.body);
    sendData(res, await wishlistService.toggle(sub, productId));
  }),

  remove: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { id } = idParamSchema.parse({ id: req.params["productId"] });
    sendData(res, await wishlistService.remove(sub, id));
  }),

  merge: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { productIds } = mergeWishlistSchema.parse(req.body);
    sendData(res, await wishlistService.merge(sub, productIds));
  }),

  moveToCart: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const input = moveToCartSchema.parse(req.body);
    sendData(res, await wishlistService.moveToCart(sub, input.productId, input.size, input.quantity));
  }),
};
