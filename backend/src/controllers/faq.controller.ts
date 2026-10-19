import { asyncHandler, sendData } from "../lib/http.js";
import { faqService } from "../services/faq.service.js";
import { createFaqSchema, faqIdParamSchema, updateFaqSchema } from "../schemas/index.js";

export const faqController = {
  /** Public: section header plus active questions, in display order. */
  list: asyncHandler(async (_req, res) => {
    sendData(res, await faqService.publicView());
  }),

  /** Admin: section header plus every question, including inactive ones. */
  listAll: asyncHandler(async (_req, res) => {
    sendData(res, await faqService.adminView());
  }),

  create: asyncHandler(async (req, res) => {
    const input = createFaqSchema.parse(req.body);
    sendData(res, await faqService.create(input), 201);
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = faqIdParamSchema.parse(req.params);
    const input = updateFaqSchema.parse(req.body);
    sendData(res, await faqService.update(id, input));
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = faqIdParamSchema.parse(req.params);
    await faqService.remove(id);
    sendData(res, { message: "FAQ deleted" });
  }),
};
