import { asyncHandler, sendData } from "../lib/http.js";
import { heroSlideService } from "../services/hero-slide.service.js";
import {
  createHeroSlideSchema,
  heroSlideIdParamSchema,
  updateHeroSlideSchema,
} from "../schemas/index.js";

export const heroSlideController = {
  /** Public: active slides only, in carousel order. */
  list: asyncHandler(async (_req, res) => {
    const slides = await heroSlideService.listActive();
    sendData(res, slides);
  }),

  /** Admin: every slide, including inactive ones. */
  listAll: asyncHandler(async (_req, res) => {
    const slides = await heroSlideService.listAll();
    sendData(res, slides);
  }),

  create: asyncHandler(async (req, res) => {
    const input = createHeroSlideSchema.parse(req.body);
    const slide = await heroSlideService.create(input);
    sendData(res, slide, 201);
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = heroSlideIdParamSchema.parse(req.params);
    const input = updateHeroSlideSchema.parse(req.body);
    const slide = await heroSlideService.update(id, input);
    sendData(res, slide);
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = heroSlideIdParamSchema.parse(req.params);
    await heroSlideService.remove(id);
    sendData(res, { message: "Hero slide deleted" });
  }),
};
