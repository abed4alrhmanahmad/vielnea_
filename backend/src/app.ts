import path from "node:path";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { generalLimiter } from "./middleware/rate-limit.js";
import { env } from "./config/env.js";
import type { Frontend } from "./lib/frontend.js";

export interface AppOptions {
  /** Serve the storefront from this app too (single-process deploys). */
  frontend?: Frontend;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * The storefront's SSR calling this same process over loopback. Those calls
 * carry no client IP, so rate limiting them would put every visitor's page
 * render into one shared bucket. A request relayed by a proxy carries
 * X-Forwarded-For and is never treated as internal.
 */
function isInternalRequest(req: express.Request): boolean {
  return !req.headers["x-forwarded-for"] && LOOPBACK.has(req.socket.remoteAddress ?? "");
}

export function createApp({ frontend }: AppOptions = {}): express.Express {
  const app = express();

  // Behind a proxy in production, so rate limiting sees the real client IP.
  if (env.isProduction) app.set("trust proxy", 1);

  app.disable("x-powered-by");

  app.use(
    helmet({
      // The API serves JSON only; CSP here would have no page to protect and
      // would interfere with the frontend's own policy.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin/server-side requests (SSR loaders) arrive with no Origin.
        if (!origin || env.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // Refuse by withholding the CORS headers rather than throwing: the
        // browser blocks the response, and a rejected origin is not a server
        // error so it should not surface as a 500.
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      // X-Guest-Token is the anonymous chat widget's bearer-equivalent — the
      // guest holds no session, so ownership travels in this header instead
      // of Authorization. Everything else here is unchanged.
      allowedHeaders: ["Content-Type", "Authorization", "X-Guest-Token"],
    }),
  );

  if (frontend) {
    // Ahead of rate limiting: one page view loads dozens of files. Vite's
    // hashed bundles under /assets never change, so they cache for a year.
    app.use(
      express.static(frontend.publicDir, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
  }

  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    frontend
      ? (req, res, next) => (isInternalRequest(req) ? next() : generalLimiter(req, res, next))
      : generalLimiter,
  );

  // With the storefront mounted, "/" is its home page instead.
  if (!frontend) {
    app.get("/", (_req, res) => {
      res.json({
        success: true,
        data: {
          name: "Vielinea API",
          version: "1.0.0",
          docs: "See backend/README.md for the endpoint reference",
          health: "/api/health",
        },
      });
    });
  }

  app.use("/api", routes);

  if (frontend) {
    // Unknown /api paths stay JSON 404s; every other path is a storefront page.
    app.use("/api", notFoundHandler);
    app.use((req, res) => void frontend.handler(req, res));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
