import { asyncHandler, sendData, sendPaginated } from "../lib/http.js";
import { orderService } from "../services/order.service.js";
import { requireUser } from "../middleware/auth.js";
import { createOrderSchema, orderQuerySchema } from "../schemas/index.js";
import { BadRequestError } from "../lib/errors.js";
import { isUuid } from "../utils/slug.js";

export const orderController = {
  create: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const input = createOrderSchema.parse(req.body);
    const order = await orderService.checkout(sub, input);
    sendData(res, order, 201);
  }),

  list: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const query = orderQuerySchema.parse(req.query);
    const { orders, pagination } = await orderService.listForUser(sub, query.page, query.limit);
    sendPaginated(res, orders, pagination);
  }),

  getById: asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const id = req.params["id"] ?? "";
    if (!isUuid(id)) throw new BadRequestError("Malformed order id");
    const order = await orderService.getForUser(id, user.sub, user.role === "admin");
    sendData(res, order);
  }),
};
