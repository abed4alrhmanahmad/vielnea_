import { asyncHandler, sendData } from "../lib/http.js";
import { authService } from "../services/auth.service.js";
import { requireUser } from "../middleware/auth.js";
import {
  changeEmailSchema,
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "../schemas/index.js";
import { env } from "../config/env.js";
import type { Response } from "express";

const COOKIE_NAME = "vielinea_token";

/**
 * The token is returned in the body (the SPA stores it) and also set as an
 * httpOnly cookie so SSR route loaders are authenticated without JS.
 */
function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export const authController = {
  register: asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    setAuthCookie(res, result.token);
    sendData(res, result, 201);
  }),

  login: asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    setAuthCookie(res, result.token);
    sendData(res, result);
  }),

  me: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const user = await authService.me(sub);
    sendData(res, { user });
  }),

  /** Edits the caller's own profile — the id always comes from the token. */
  updateMe: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const input = updateProfileSchema.parse(req.body);
    const result = await authService.updateProfile(sub, input);
    // The email is inside the token, so re-issue it and refresh the cookie.
    setAuthCookie(res, result.token);
    sendData(res, result);
  }),

  changePassword: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    sendData(res, await authService.changePassword(sub, currentPassword, newPassword));
  }),

  changeEmail: asyncHandler(async (req, res) => {
    const { sub } = requireUser(req);
    const { email, currentPassword } = changeEmailSchema.parse(req.body);
    const result = await authService.changeEmail(sub, email, currentPassword);
    // The email is inside the token, so re-issue it and refresh the cookie.
    setAuthCookie(res, result.token);
    sendData(res, result);
  }),

  logout: asyncHandler(async (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    sendData(res, { message: "Signed out" });
  }),
};
