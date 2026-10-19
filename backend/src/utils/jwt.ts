import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../lib/errors.js";
import type { AuthTokenPayload } from "../types/api.js";

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: "vielinea-api",
  } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: "vielinea-api" });
    if (typeof decoded === "string") throw new Error("unexpected token payload");

    const { sub, email, role } = decoded as jwt.JwtPayload & Partial<AuthTokenPayload>;
    if (!sub || !email || (role !== "customer" && role !== "admin")) {
      throw new Error("incomplete token payload");
    }
    return { sub, email, role };
  } catch {
    throw new UnauthorizedError("Your session is invalid or has expired. Please sign in again.");
  }
}
