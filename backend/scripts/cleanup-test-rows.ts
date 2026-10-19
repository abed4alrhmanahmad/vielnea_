/**
 * Removes leftover rows created by test runs. Targets only records whose slug
 * or code is explicitly test-prefixed — seeded VIELINEA data is never matched.
 */
import pg from "pg";
import { env } from "../src/config/env.js";

async function main(): Promise<void> {
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-cleanup",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  const cats = await client.query(
    `DELETE FROM public.categories
     WHERE slug IN ('debug-temp-category', 'e2e-temp-category', 'e2e-renamed-category')
       AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = categories.id)
     RETURNING slug`,
  );
  const prods = await client.query(
    `DELETE FROM public.products WHERE slug LIKE 'e2e-%' RETURNING slug`,
  );
  const users = await client.query(
    `DELETE FROM public.users WHERE email LIKE '%@vielinea.test' RETURNING email`,
  );

  console.log(`categories removed : ${cats.rowCount} ${cats.rows.map((r) => r["slug"]).join(", ")}`);
  console.log(`products removed   : ${prods.rowCount} ${prods.rows.map((r) => r["slug"]).join(", ")}`);
  console.log(`test users removed : ${users.rowCount}`);

  const { rows } = await client.query<{ products: number; categories: number }>(`
    SELECT (SELECT count(*)::int FROM public.products)    AS products,
           (SELECT count(*)::int FROM public.categories)  AS categories
  `);
  console.log(`\nremaining: products=${rows[0]?.products} categories=${rows[0]?.categories}`);

  await client.end();
}

main().catch((error: unknown) => {
  console.error(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
