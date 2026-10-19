import type { Response, RequestHandler, Request, NextFunction } from "express";
import type { ApiSuccess, PaginationMeta } from "../types/api.js";

/** Standard success envelope: { success: true, data } */
export function sendData<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiSuccess<T> = { success: true, data };
  res.status(statusCode).json(body);
}

/** Success envelope with pagination metadata alongside the data. */
export function sendPaginated<T>(
  res: Response,
  data: T,
  pagination: PaginationMeta,
  statusCode = 200,
): void {
  const body: ApiSuccess<T> = { success: true, data, pagination };
  res.status(statusCode).json(body);
}

/**
 * Wraps an async handler so a rejected promise reaches the Express error
 * middleware instead of becoming an unhandled rejection.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

export function buildPagination(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
  };
}
