// Production entry for single-process deploys (GoDaddy Node.js Hosting).
//
// Runs the existing Express API (backend/) and has it serve the storefront's
// Nitro build (frontend/.output) from the same process and port. All server
// logic lives in backend/src/server.ts; this only points it at the storefront.
// Build first with `npm run build`. See DEPLOYMENT.md.
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const apiEntry = path.join(root, "backend", "dist", "src", "server.js");

process.env.NODE_ENV ??= "production";
process.env.FRONTEND_OUTPUT_DIR ??= path.join(root, "frontend", ".output");

if (!existsSync(apiEntry)) {
  console.error(`Missing ${apiEntry} — run \`npm run build\` before \`npm start\`.`);
  process.exit(1);
}

await import(pathToFileURL(apiEntry).href);
