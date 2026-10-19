/**
 * Applies pending SQL migrations from backend/supabase/migrations in filename
 * order, tracking what ran in public.schema_migrations.
 *
 * Uses the session pooler (port 5432) because DDL and
 * multi-statement transactions are not supported on the transaction pooler.
 *
 * Idempotent: already-applied versions are skipped, and each file is written to
 * be re-runnable anyway.
 */
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { env } from "../src/config/env.js";

const MIGRATIONS_DIR = path.join(env.backendRoot, "supabase", "migrations");

async function main(): Promise<void> {
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-migrate",
    connectionTimeoutMillis: 20_000,
  });

  await client.connect();
  console.log(`Connected. Found ${files.length} migration file(s).\n`);

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.version));

    let ran = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        console.log(`  = ${file} (already applied)`);
        continue;
      }

      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`  + ${file} ... `);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
          [version],
        );
        await client.query("COMMIT");
        console.log("applied");
        ran += 1;
      } catch (error) {
        await client.query("ROLLBACK");
        console.log("FAILED");
        throw error;
      }
    }

    console.log(`\nMigrations complete. ${ran} applied, ${files.length - ran} already present.`);

    const { rows: tables } = await client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log(`\nTables in public (${tables.length}):`);
    for (const t of tables) console.log(`  - ${t.table_name}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nMigration failed: ${message}`);
  process.exit(1);
});
