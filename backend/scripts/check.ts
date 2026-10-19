/**
 * Non-destructive Supabase/PostgreSQL access verification.
 *
 * Creates nothing permanent and deletes nothing: the write probe uses a
 * temporary table inside a transaction that is always rolled back, and the
 * migration probe only inspects privileges.
 *
 *   npm run db:check
 */
import pg from "pg";
import { env } from "../src/config/env.js";

type Status = "YES" | "NO";

const results: Array<[string, Status, string]> = [];
function record(label: string, ok: boolean, note = ""): void {
  results.push([label, ok ? "YES" : "NO", note]);
}

async function main(): Promise<void> {
  console.log(`Supabase URL : ${env.SUPABASE_URL}`);
  console.log(`Database host: ${env.dbDisplayHost}\n`);

  // --- REST reachability (does not require the DB password) ----------------
  try {
    const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY ?? "";
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
      headers: key ? { apikey: key, Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(15_000),
    });
    record(
      "Supabase project connected",
      res.status !== 401 && res.status !== 403,
      `HTTP ${res.status}${res.status === 401 ? " (missing/invalid API key)" : ""}`,
    );
  } catch (error) {
    record("Supabase project connected", false, error instanceof Error ? error.message : "failed");
  }

  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-check",
    connectionTimeoutMillis: 20_000,
  });

  let connected = false;
  try {
    await client.connect();
    connected = true;
    const { rows } = await client.query<{ version: string; db: string; usr: string }>(
      "SELECT version() AS version, current_database() AS db, current_user AS usr",
    );
    const info = rows[0];
    record("Database connection", true, info ? `${info.usr}@${info.db}` : "");
    if (info) console.log(`PostgreSQL   : ${info.version.split(" ").slice(0, 2).join(" ")}\n`);
  } catch (error) {
    record("Database connection", false, error instanceof Error ? error.message : "failed");
  }

  let tables: string[] = [];

  if (connected) {
    // --- read ------------------------------------------------------------
    try {
      const { rows } = await client.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      tables = rows.map((r) => r.table_name);
      record("Database read access", true, `${tables.length} table(s) in public`);
    } catch (error) {
      record("Database read access", false, error instanceof Error ? error.message : "failed");
    }

    // --- write (rolled back) ---------------------------------------------
    try {
      await client.query("BEGIN");
      await client.query("CREATE TEMPORARY TABLE _vielinea_probe (id int) ON COMMIT DROP");
      await client.query("INSERT INTO _vielinea_probe (id) VALUES (1)");
      const { rows } = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM _vielinea_probe",
      );
      await client.query("ROLLBACK");
      record("Database write access", rows[0]?.count === 1, "verified via rolled-back transaction");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* connection already unusable */
      }
      record("Database write access", false, error instanceof Error ? error.message : "failed");
    }

    // --- migration capability (CREATE privilege on schema public) --------
    try {
      const { rows } = await client.query<{ can: boolean }>(
        "SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS can",
      );
      record("Migration capability", rows[0]?.can === true, "CREATE on schema public");
    } catch (error) {
      record("Migration capability", false, error instanceof Error ? error.message : "failed");
    }

    await client.end();
  } else {
    record("Database read access", false, "no connection");
    record("Database write access", false, "no connection");
    record("Migration capability", false, "no connection");
  }

  // --- report -------------------------------------------------------------
  console.log("=".repeat(64));
  const width = Math.max(...results.map(([l]) => l.length));
  for (const [label, status, note] of results) {
    console.log(`${label.padEnd(width)} : ${status}${note ? `  (${note})` : ""}`);
  }
  console.log("=".repeat(64));

  const expected = [
    "users",
    "categories",
    "products",
    "product_images",
    "product_sizes",
    "product_measurements",
    "wishlist_items",
    "cart_items",
    "orders",
    "order_items",
    "reviews",
    "contact_messages",
    "newsletter_subscribers",
  ];

  if (tables.length > 0) {
    const present = expected.filter((t) => tables.includes(t));
    const missing = expected.filter((t) => !tables.includes(t));
    const extra = tables.filter((t) => !expected.includes(t) && t !== "schema_migrations");

    console.log(`\nVielinea tables found (${present.length}/${expected.length}):`);
    console.log(present.length ? `  ${present.join(", ")}` : "  none");
    if (missing.length) console.log(`\nMissing (run npm run db:migrate):\n  ${missing.join(", ")}`);
    if (extra.length) console.log(`\nOther tables already in this database:\n  ${extra.join(", ")}`);
  } else {
    console.log("\nNo tables readable — nothing inspected, nothing changed.");
  }

  const allOk = results.every(([, s]) => s === "YES");
  console.log(
    allOk
      ? "\nAll access checks passed."
      : "\nOne or more checks failed — see the notes above before running migrations.",
  );
  process.exit(allOk ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`Check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
