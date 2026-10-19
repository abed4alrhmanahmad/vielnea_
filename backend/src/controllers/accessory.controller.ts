import { asyncHandler, buildPagination, sendData, sendPaginated } from "../lib/http.js";
import { accessoryService } from "../services/accessory.service.js";
import { BadRequestError } from "../lib/errors.js";
import { SUPPORTED_IMAGE_LABEL, uploadAccessoryImage } from "../lib/storage.js";
import {
  accessoryQuerySchema,
  createAccessorySchema,
  idParamSchema,
  updateAccessorySchema,
} from "../schemas/index.js";

export const accessoryController = {
  list: asyncHandler(async (req, res) => {
    const query = accessoryQuerySchema.parse(req.query);
    const { accessories, total } = await accessoryService.list(query);
    sendPaginated(res, accessories, buildPagination(total, query.page, query.limit));
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const accessory = await accessoryService.getByIdOrSlug(id);
    sendData(res, accessory);
  }),

  create: asyncHandler(async (req, res) => {
    const input = createAccessorySchema.parse(req.body);
    const accessory = await accessoryService.create(input);
    sendData(res, accessory, 201);
  }),

  /**
   * Stores one uploaded accessory image and returns its public URL, which the
   * admin panel then submits as a normal `images[].imageUrl`. The body is the
   * raw file (see the express.raw parser on this route), so the create
   * endpoint keeps working unchanged for pasted URLs. Same contract as the
   * product image upload.
   */
  uploadImage: asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new BadRequestError(
        `Send the raw image bytes with an image Content-Type (${SUPPORTED_IMAGE_LABEL})`,
      );
    }
    const url = await uploadAccessoryImage(req.body, req.get("content-type") ?? "");
    sendData(res, { url }, 201);
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updateAccessorySchema.parse(req.body);
    const accessory = await accessoryService.update(id, input);
    sendData(res, accessory);
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await accessoryService.remove(id);
    sendData(res, { message: "Accessory deleted" });
  }),
};
