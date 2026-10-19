import { asyncHandler, sendData } from "../lib/http.js";
import { messageService } from "../services/message.service.js";
import { contactSchema, newsletterSchema } from "../schemas/index.js";

export const messageController = {
  contact: asyncHandler(async (req, res) => {
    const input = contactSchema.parse(req.body);
    sendData(res, await messageService.submitContact(input), 201);
  }),

  newsletter: asyncHandler(async (req, res) => {
    const input = newsletterSchema.parse(req.body);
    const result = await messageService.subscribe(input);
    sendData(res, result, result.alreadySubscribed ? 200 : 201);
  }),
};
