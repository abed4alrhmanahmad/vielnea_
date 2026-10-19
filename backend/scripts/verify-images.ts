/**
 * Confirms every image_url stored in the database resolves to a real file in
 * frontend/public. Read-only on both the database and the filesystem.
 */
import pg from "pg";
import path from "node:path";
import { existsSync } from "node:fs";
import { env } from "../src/config/env.js";

const PUBLIC_DIR = path.resolve(env.backendRoot, "..", "frontend", "public");

async function main(): Promise<void> {
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-verify-images",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  const { rows } = await client.query<{ image_url: string; title: string }>(`
    SELECT pi.image_url, p.title
    FROM public.product_images pi
    JOIN public.products p ON p.id = pi.product_id
    ORDER BY p.title, pi.sort_order
  `);

  const { rows: catRows } = await client.query<{ image_url: string | null; label: string }>(
    "SELECT image_url, label FROM public.categories ORDER BY sort_order",
  );

  const checked = new Map<string, boolean>();
  let missing = 0;

  const check = (url: string | null): boolean => {
    if (!url) return true;
    if (checked.has(url)) return checked.get(url)!;
    const rel = url.replace(/^\//, "").split("/").join(path.sep);
    const ok = existsSync(path.join(PUBLIC_DIR, rel));
    checked.set(url, ok);
    return ok;
  };

  console.log(`Public dir: ${PUBLIC_DIR}\n`);
  console.log(`Product image records: ${rows.length}`);
  for (const r of rows) {
    if (!check(r.image_url)) {
      console.log(`  MISSING  ${r.image_url}  (${r.title})`);
      missing += 1;
    }
  }

  console.log(`Category image records: ${catRows.length}`);
  for (const c of catRows) {
    if (!check(c.image_url)) {
      console.log(`  MISSING  ${c.image_url}  (${c.label})`);
      missing += 1;
    }
  }

  console.log(`\nDistinct image paths referenced: ${checked.size}`);
  for (const [url, ok] of [...checked.entries()].sort()) {
    console.log(`  ${ok ? "OK  " : "MISS"}  ${url}`);
  }

  await client.end();

  console.log(
    missing === 0
      ? "\nAll image references resolve to existing files.\n"
      : `\n${missing} image reference(s) do not resolve.\n`,
  );
  process.exit(missing === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`Image verify failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
