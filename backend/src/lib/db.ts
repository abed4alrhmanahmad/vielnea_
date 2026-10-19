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
  max: 10,
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
