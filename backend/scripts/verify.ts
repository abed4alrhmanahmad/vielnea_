/**
 * Read-only verification of seeded data. Writes nothing.
 *
 *   npm run db:verify
 */
import pg from "pg";
import { env } from "../src/config/env.js";
import { seedProducts } from "../supabase/seed/catalog.js";

interface Check {
  label: string;
  actual: number | string;
  expected?: number | string;
  ok: boolean;
}

async function main(): Promise<void> {
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-verify",
    connectionTimeoutMillis: 20_000,
  });

  await client.connect();
  const checks: Check[] = [];

  const scalar = async (sql: string, params: unknown[] = []): Promise<number> => {
    const { rows } = await client.query<{ value: number }>(sql, params);
    return rows[0]?.value ?? 0;
  };

  const expectedImages = seedProducts.reduce((n, p) => n + p.images.length, 0);
  const expectedSizes = seedProducts.reduce((n, p) => n + p.sizes.length, 0);

  const productCount = await scalar("SELECT count(*)::int AS value FROM public.products");
  checks.push({
    label: "products",
    actual: productCount,
    expected: seedProducts.length,
    ok: productCount >= seedProducts.length,
  });

  const categoryCount = await scalar("SELECT count(*)::int AS value FROM public.categories");
  checks.push({ label: "categories", actual: categoryCount, expected: 8, ok: categoryCount >= 8 });

  const imageCount = await scalar("SELECT count(*)::int AS value FROM public.product_images");
  checks.push({
    label: "product_images",
    actual: imageCount,
    expected: expectedImages,
    ok: imageCount >= expectedImages,
  });

  const sizeCount = await scalar("SELECT count(*)::int AS value FROM public.product_sizes");
  checks.push({
    label: "product_sizes",
    actual: sizeCount,
    expected: expectedSizes,
    ok: sizeCount >= expectedSizes,
  });

  const measurementCount = await scalar(
    "SELECT count(*)::int AS value FROM public.product_measurements",
  );
  checks.push({
    label: "product_measurements",
    actual: measurementCount,
    expected: seedProducts.length,
    ok: measurementCount >= seedProducts.length,
  });

  const reviewCount = await scalar("SELECT count(*)::int AS value FROM public.reviews");
  checks.push({ label: "reviews", actual: reviewCount, expected: 3, ok: reviewCount >= 3 });

  const demoUser = await scalar(
    "SELECT count(*)::int AS value FROM public.users WHERE lower(email) = lower($1)",
    [env.DEMO_USER_EMAIL],
  );
  checks.push({ label: `demo user (${env.DEMO_USER_EMAIL})`, actual: demoUser, expected: 1, ok: demoUser === 1 });

  const adminUser = await scalar(
    "SELECT count(*)::int AS value FROM public.users WHERE role = 'admin'",
  );
  checks.push({ label: "admin users", actual: adminUser, expected: ">= 1", ok: adminUser >= 1 });

  // Integrity: nothing orphaned, no product without an image or a price.
  const orphanImages = await scalar(`
    SELECT count(*)::int AS value FROM public.product_images pi
    LEFT JOIN public.products p ON p.id = pi.product_id WHERE p.id IS NULL
  `);
  checks.push({ label: "orphaned images", actual: orphanImages, expected: 0, ok: orphanImages === 0 });

  const imagelessProducts = await scalar(`
    SELECT count(*)::int AS value FROM public.products p
    WHERE NOT EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.product_id = p.id)
  `);
  checks.push({
    label: "products without images",
    actual: imagelessProducts,
    expected: 0,
    ok: imagelessProducts === 0,
  });

  const badPrices = await scalar(
    "SELECT count(*)::int AS value FROM public.products WHERE price <= 0",
  );
  checks.push({ label: "products with bad price", actual: badPrices, expected: 0, ok: badPrices === 0 });

  // Per-size stock should sum to the product-level figure.
  const stockMismatch = await scalar(`
    SELECT count(*)::int AS value FROM (
      SELECT p.id
      FROM public.products p
      JOIN public.product_sizes ps ON ps.product_id = p.id
      GROUP BY p.id, p.stock
      HAVING sum(ps.stock) <> p.stock
    ) mismatched
  `);
  checks.push({
    label: "size-stock mismatches",
    actual: stockMismatch,
    expected: 0,
    ok: stockMismatch === 0,
  });

  console.log("\nSeeded data verification");
  console.log("=".repeat(60));
  const width = Math.max(...checks.map((c) => c.label.length));
  for (const c of checks) {
    const expected = c.expected !== undefined ? `  (expected ${c.expected})` : "";
    console.log(`${c.ok ? "OK  " : "FAIL"}  ${c.label.padEnd(width)}  ${c.actual}${expected}`);
  }
  console.log("=".repeat(60));

  // Spot-check a real row end to end.
  const { rows: sample } = await client.query<{
    slug: string;
    title: string;
    price: string;
    discount: number;
    category: string;
    images: number;
    sizes: number;
    labels: Record<string, string>;
  }>(`
    SELECT p.slug, p.title, p.price, p.discount, c.label AS category,
           (SELECT count(*)::int FROM public.product_images pi WHERE pi.product_id = p.id) AS images,
           (SELECT count(*)::int FROM public.product_sizes ps WHERE ps.product_id = p.id) AS sizes,
           (SELECT pm.labels FROM public.product_measurements pm WHERE pm.product_id = p.id LIMIT 1) AS labels
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
    WHERE p.slug = 'linen-midi-dress'
  `);

  if (sample[0]) {
    const s = sample[0];
    console.log(`\nSample row — ${s.slug}`);
    console.log(`  title       ${s.title}`);
    console.log(`  category    ${s.category}`);
    console.log(`  price       $${s.price} (discount ${s.discount}%)`);
    console.log(`  images      ${s.images}`);
    console.log(`  sizes       ${s.sizes}`);
    console.log(`  measurements ${JSON.stringify(s.labels)}`);
  } else {
    console.log("\nSample row 'linen-midi-dress' NOT FOUND — seed did not run.");
  }

  await client.end();

  const failed = checks.filter((c) => !c.ok);
  console.log(
    failed.length === 0
      ? "\nAll verification checks passed.\n"
      : `\n${failed.length} check(s) failed.\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`Verify failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
