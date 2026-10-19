import { asyncHandler, sendData } from "../lib/http.js";
import { cartService } from "../services/cart.service.js";
import { requireUser } from "../middleware/auth.js";
import {
  addToCartSchema,
  cartItemQuerySchema,
  idParamSchema,
  mergeCartSchema,
  updateCartItemSchema,
} from "../schemas/index.js";

export const cartController = {
  get: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    sendData(res, await cartService.get(sub));
  }),

  add: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const input = addToCartSchema.parse(req.body);
    sendData(res, await cartService.add(sub, input), 201);
  }),

  update: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { id } = idParamSchema.parse({ id: req.params["productId"] });
    const input = updateCartItemSchema.parse(req.body);
    sendData(res, await cartService.updateQuantity(sub, id, input));
  }),

  remove: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { id } = idParamSchema.parse({ id: req.params["productId"] });
    const { size } = cartItemQuerySchema.parse(req.query);
    sendData(res, await cartService.remove(sub, id, size));
  }),

  clear: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    sendData(res, await cartService.clear(sub));
  }),

  merge: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { items } = mergeCartSchema.parse(req.body);
    sendData(res, await cartService.merge(sub, items));
  }),
};
