import type { RequestHandler } from "express";
import type { ZodTypeAny, z } from "zod";

type Source = "body" | "query" | "params";

/**
 * Validates and replaces req[source] with the parsed result, so downstream
 * handlers receive coerced, typed data. ZodErrors are turned into 422 responses
 * by the central error handler.
 */
export function validate(schema: ZodTypeAny, source: Source = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    if (source === "query") {
      // req.query has a getter-only definition in Express 5-style typings;
      // assigning through a cast keeps the parsed value available.
      Object.defineProperty(req, "query", { value: result.data, writable: true });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

/** Convenience helper for reading a validated body inside a controller. */
export function parsed<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value) as z.infer<T>;
}
