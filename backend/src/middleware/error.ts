import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, NotFoundError } from "../lib/errors.js";
import { env } from "../config/env.js";
import type { ApiFailure } from "../types/api.js";

/** 404 for unmatched routes — forwarded into the error handler below. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};

interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

/**
 * Postgres reports a five-character SQLSTATE in `code`. Matching that shape
 * matters: body-parser and other http-errors also carry a string `code`
 * (e.g. "ENTITY_TOO_LARGE"), and treating those as database faults used to
 * turn a 413 into a generic 500.
 */
function isPgError(error: unknown): error is PgError {
  return (
    error instanceof Error && /^[0-9A-Z]{5}$/.test((error as PgError).code ?? "")
  );
}

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  expose?: boolean;
}

/** Errors thrown by Express/body-parser already carry the right status. */
function isHttpError(error: unknown): error is HttpError {
  if (!(error instanceof Error)) return false;
  const status = (error as HttpError).status ?? (error as HttpError).statusCode;
  return typeof status === "number" && status >= 400 && status < 600;
}

/**
 * Central error handler. Operational errors keep their message and status;
 * everything else becomes a generic 500. Stack traces are never sent to the
 * client — they are logged server-side only.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  let statusCode = 500;
  let message = "Something went wrong";
  let errors: ApiFailure["errors"];

  if (error instanceof ZodError) {
    statusCode = 422;
    message = "Validation failed";
    errors = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  } else if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    if (Array.isArray(error.details)) {
      errors = error.details as ApiFailure["errors"];
    }
  } else if (isPgError(error)) {
    // Map the handful of constraint violations that are genuinely the client's
    // fault; everything else stays a generic 500 so schema details don't leak.
    switch (error.code) {
      case "23505": // unique_violation
        statusCode = 409;
        message = "That record already exists";
        break;
      case "23503":
        statusCode = 400;
        message = "Referenced record does not exist";
        break;
      case "23514":
        statusCode = 422;
        message = "One or more values are outside the allowed range";
        break;
      case "22P02":
        statusCode = 400;
        message = "Malformed identifier";
        break;
      default:
        statusCode = 500;
        message = "Something went wrong";
    }
  } else if (isHttpError(error)) {
    statusCode = (error.status ?? error.statusCode) as number;
    message =
      statusCode === 413
        ? "Payload too large"
        : statusCode === 400
          ? "Malformed request body"
          : error.message;
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(
      `[error] ${req.method} ${req.originalUrl} ->`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
  } else if (env.isDevelopment) {
    // eslint-disable-next-line no-console
    console.warn(
      `[warn] ${req.method} ${req.originalUrl} -> ${statusCode} ${message}`,
    );
  }

  const body: ApiFailure = { success: false, message };
  if (errors?.length) body.errors = errors;

  res.status(statusCode).json(body);
};
