// Builds backend/ and frontend/ for the single-process deploy (server.mjs).
//
// The hosting platform installs only this root package (which has no
// dependencies), so each app's own lockfile is installed here, dev tools
// included: TypeScript and Vite are build-time devDependencies.
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = {
  ...process.env,
  // Nitro targets Cloudflare by default; this deploy embeds it in Express.
  NITRO_PRESET: "node-middleware",
  // Same-origin API. Set VITE_API_URL to an absolute URL to use an API hosted
  // elsewhere instead (DEPLOYMENT.md, "split hosting").
  VITE_API_URL: process.env.VITE_API_URL || "/api",
};

function run(command, cwd) {
  console.log(`\n> [${path.relative(root, cwd) || "."}] ${command}`);
  execSync(command, { cwd, env, stdio: "inherit" });
}

/** Install unless node_modules is already current with the lockfile. */
function needsInstall(dir) {
  const installed = path.join(dir, "node_modules", ".package-lock.json");
  if (!existsSync(installed)) return true;
  return statSync(path.join(dir, "package-lock.json")).mtimeMs > statSync(installed).mtimeMs;
}

for (const app of ["backend", "frontend"]) {
  const dir = path.join(root, app);
  if (needsInstall(dir)) run("npm ci --include=dev --no-audit --no-fund", dir);
  run("npm run build", dir);
}

console.log(`\nBuild complete (VITE_API_URL=${env.VITE_API_URL}). Start with: npm start`);
