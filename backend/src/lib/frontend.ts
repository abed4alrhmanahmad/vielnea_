import path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../config/env.js";

/** The storefront build, served from this process on single-app deploys. */
export interface Frontend {
  /** Static files: hashed bundles, fonts, images. */
  publicDir: string;
  /** Nitro's Node handler for every page request (SSR). */
  handler: (req: IncomingMessage, res: ServerResponse) => unknown;
}

/**
 * Loads the storefront when FRONTEND_OUTPUT_DIR points at a Nitro
 * `node-middleware` build. Returns undefined when it is unset, which keeps the
 * API-only behaviour used in development.
 */
export async function loadFrontend(): Promise<Frontend | undefined> {
  const dir = env.FRONTEND_OUTPUT_DIR;
  if (!dir) return undefined;

  const entry = path.join(dir, "server", "index.mjs");
  if (!existsSync(entry)) {
    throw new Error(`FRONTEND_OUTPUT_DIR is set but ${entry} does not exist — run \`npm run build\` first.`);
  }

  const mod = (await import(pathToFileURL(entry).href)) as { middleware?: Frontend["handler"] };
  if (typeof mod.middleware !== "function") {
    throw new Error(
      `${entry} is not a Nitro node-middleware build — rebuild the frontend with NITRO_PRESET=node-middleware.`,
    );
  }

  return { publicDir: path.join(dir, "public"), handler: mod.middleware };
}
