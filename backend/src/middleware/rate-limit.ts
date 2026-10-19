import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const json = (message: string) => ({ success: false, message });

/** Generous cap for ordinary browsing traffic. */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProduction ? 600 : 5000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many requests. Please slow down and try again shortly."),
});

/** Tight cap on credential endpoints to blunt brute-force attempts. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProduction ? 20 : 200,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many attempts. Please wait a few minutes and try again."),
});

/** Cap on public write endpoints (contact form, newsletter, reviews). */
export const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.isProduction ? 30 : 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many submissions. Please try again later."),
});
