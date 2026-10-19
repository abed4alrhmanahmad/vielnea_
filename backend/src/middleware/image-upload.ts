import { raw } from "express";
import type { RequestHandler } from "express";
import { AppError } from "../lib/errors.js";
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB, UPLOAD_CONTENT_TYPES } from "../lib/storage.js";

/**
 * Buffers the raw image bytes for the upload endpoints.
 *
 * The body parser enforces the size cap itself and aborts the stream as soon
 * as it is exceeded, so an oversized file is never held in memory in full. It
 * also means the cap is hit before any route code runs, and body-parser's own
 * error would surface through the generic handler as "Payload too large" —
 * true but useless, since it names neither the limit nor the field. The 413 is
 * therefore translated into the same message `uploadCatalogImage` uses for a
 * file that slips past the parser, so the admin sees one consistent, specific
 * error either way.
 */
const parseImageBody = raw({ type: UPLOAD_CONTENT_TYPES, limit: MAX_IMAGE_BYTES });

export const imageUploadBody: RequestHandler = (req, res, next) => {
  parseImageBody(req, res, (error: unknown) => {
    const status =
      error instanceof Error
        ? ((error as { status?: number; statusCode?: number }).status ??
          (error as { status?: number; statusCode?: number }).statusCode)
        : undefined;

    if (status === 413) {
      next(new AppError(`Image must be ${MAX_IMAGE_MB} MB or smaller`, 413));
      return;
    }
    next(error);
  });
};
