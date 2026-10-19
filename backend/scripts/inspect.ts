/**
 * Read-only inspection of the current database, run before migrations so any
 * pre-existing objects are known rather than assumed. Writes nothing.
 */
import pg from "pg";
import { env } from "../src/config/env.js";

async function main(): Promise<void> {
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-inspect",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  const { rows: schemas } = await client.query<{ nspname: string }>(`
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
    ORDER BY nspname
  `);
  console.log(`Schemas present (${schemas.length}):`);
  console.log(`  ${schemas.map((s) => s.nspname).join(", ")}`);

  // Supabase-managed schemas confirm which project this database belongs to.
  const supabaseSchemas = ["auth", "storage", "realtime", "graphql"].filter((s) =>
    schemas.some((r) => r.nspname === s),
  );
  console.log(`\nSupabase-managed schemas found: ${supabaseSchemas.join(", ") || "none"}`);

  const { rows: tables } = await client.query<{
    table_schema: string;
    table_name: string;
    n_live: string | null;
  }>(`
    SELECT t.table_schema, t.table_name,
           (SELECT c.reltuples::bigint FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = t.table_schema AND c.relname = t.table_name) AS n_live
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  `);

  console.log(`\nTables in public schema: ${tables.length}`);
  for (const t of tables) {
    console.log(`  - ${t.table_name} (~${t.n_live ?? 0} rows)`);
  }

  if (tables.length === 0) {
    console.log("  (empty — nothing at risk, migrations will create everything)");
  }

  const { rows: exts } = await client.query<{ extname: string }>(
    "SELECT extname FROM pg_extension ORDER BY extname",
  );
  console.log(`\nExtensions: ${exts.map((e) => e.extname).join(", ")}`);

  await client.end();
}

main().catch((error: unknown) => {
  console.error(`Inspect failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
