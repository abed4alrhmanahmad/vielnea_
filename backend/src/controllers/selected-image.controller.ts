import { asyncHandler, sendData } from "../lib/http.js";
import { selectedImageService } from "../services/selected-image.service.js";
import {
  createSelectedImageSchema,
  selectedImageIdParamSchema,
  updateSelectedImageSchema,
} from "../schemas/index.js";

export const selectedImageController = {
  /** Public: active images only, in marquee order. */
  list: asyncHandler(async (_req, res) => {
    const images = await selectedImageService.listActive();
    sendData(res, images);
  }),

  /** Admin: every image, including inactive ones. */
  listAll: asyncHandler(async (_req, res) => {
    const images = await selectedImageService.listAll();
    sendData(res, images);
  }),

  create: asyncHandler(async (req, res) => {
    const input = createSelectedImageSchema.parse(req.body);
    const image = await selectedImageService.create(input);
    sendData(res, image, 201);
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = selectedImageIdParamSchema.parse(req.params);
    const input = updateSelectedImageSchema.parse(req.body);
    const image = await selectedImageService.update(id, input);
    sendData(res, image);
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = selectedImageIdParamSchema.parse(req.params);
    await selectedImageService.remove(id);
    sendData(res, { message: "Selected image deleted" });
  }),
};
