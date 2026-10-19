import type { Request, RequestHandler } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { verifyToken } from "../utils/jwt.js";
import type { AuthTokenPayload } from "../types/api.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/** Reads the JWT from the Authorization header, falling back to the cookie. */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.["vielinea_token"];
  return cookieToken ?? null;
}

/** Rejects the request unless a valid token is present. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) {
    next(new UnauthorizedError("You must be signed in to do that"));
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Attaches req.user when a valid token is present but never rejects.
 * Used by endpoints that behave differently for signed-in visitors
 * (e.g. reviews marking a purchase as verified).
 */
export const optionalAuthenticate: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // An invalid token is treated as anonymous rather than an error.
    }
  }
  next();
};

/** Must run after `authenticate`. */
export const authorizeAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(new UnauthorizedError("You must be signed in to do that"));
    return;
  }
  if (req.user.role !== "admin") {
    next(new ForbiddenError("This action requires an administrator account"));
    return;
  }
  next();
};

/** Narrows req.user for handlers mounted behind `authenticate`. */
export function requireUser(req: Request): AuthTokenPayload {
  if (!req.user) throw new UnauthorizedError("You must be signed in to do that");
  return req.user;
}
