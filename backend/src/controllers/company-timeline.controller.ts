import { asyncHandler, sendData } from "../lib/http.js";
import { companyTimelineService } from "../services/company-timeline.service.js";
import {
  createTimelineEntrySchema,
  timelineIdParamSchema,
  updateTimelineEntrySchema,
} from "../schemas/index.js";

export const companyTimelineController = {
  /** Public: feature state plus active entries, in display order. */
  get: asyncHandler(async (_req, res) => {
    sendData(res, await companyTimelineService.publicView());
  }),

  /** Admin: feature state plus every entry, including inactive ones. */
  getAll: asyncHandler(async (_req, res) => {
    sendData(res, await companyTimelineService.adminView());
  }),

  create: asyncHandler(async (req, res) => {
    const input = createTimelineEntrySchema.parse(req.body);
    sendData(res, await companyTimelineService.create(input), 201);
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = timelineIdParamSchema.parse(req.params);
    const input = updateTimelineEntrySchema.parse(req.body);
    sendData(res, await companyTimelineService.update(id, input));
  }),

  remove: asyncHandler(async (req, res) => {
    const { id } = timelineIdParamSchema.parse(req.params);
    await companyTimelineService.remove(id);
    sendData(res, { message: "Timeline entry deleted" });
  }),
};
