import pg from "pg";
import { env } from "../config/env.js";

const { Pool, types } = pg;

// numeric/decimal (OID 1700) arrives as a string by default so precision is not
// lost. Money columns here are all within JS safe-number range, and the API
// contract is numeric JSON, so parse them to numbers centrally.
types.setTypeParser(1700, (value: string) => Number.parseFloat(value));
// int8 (OID 20) — only used for COUNT(*) results here.
types.setTypeParser(20, (value: string) => Number.parseInt(value, 10));

/**
 * Runtime pool. Points at the transaction pooler when DATABASE_POOL_URL is set.
 *
 * Supabase's `db.<ref>.supabase.co` host is IPv6-only; the pooler hosts
 * (`aws-*.pooler.supabase.com`) are dual-stack, so the pooler is the reliable
 * choice from IPv4-only networks. See backend/README.md.
 */
export const pool = new Pool({
  ...env.db,
  ssl: { rejectUnauthorized: false },
  // The session pooler allows 15 clients across every backend. Render runs
  // the old and new instance side by side during a deploy, and 2 x (10 + the
  // chat LISTEN client) overflowed it (EMAXCONNSESSION 500s on each deploy).
  // 2 x (5 + 1) = 12 leaves 3 slots for a developer's local backend or scripts.
  // Measured at production-like latency: 5 vs 6 made no difference to visitors
  // or checkout, because identical concurrent cache misses share one query.
  max: 5,
  // The database is in Tokyo and the server in Frankfurt, so opening a
  // connection (TCP + TLS + auth, several ~230ms round trips) cost the first
  // visitor after a quiet spell ~2s. Production keeps two connections open
  // instead of letting the idle timeout close them all; extras still close.
  min: env.isProduction ? 2 : 0,
  // Stops NATs and the pooler from silently dropping the kept connections.
  keepAlive: true,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  application_name: "vielinea-api",
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db] unexpected idle client error:", err.message);
});

export type QueryParams = ReadonlyArray<unknown>;

/** Run a parameterised query. Never interpolate user input into SQL text. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: QueryParams = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

/** First row or null. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: QueryParams = [],
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/** All rows. */
export async function queryMany<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: QueryParams = [],
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Runs `fn` inside a transaction on a dedicated client, rolling back on throw.
 * Used for order creation, where stock changes and cart clearing must be atomic.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // the connection is already broken; the original error is what matters
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
