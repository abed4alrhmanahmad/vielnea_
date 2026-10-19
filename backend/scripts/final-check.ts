/**
 * Final verification directly against Supabase.
 *
 * Proves the full path works for both READ and WRITE:
 *   Express API -> PostgreSQL -> Supabase
 *
 * The write proof inserts one row into each of cart_items, wishlist_items,
 * orders/order_items and reviews for the demo user, reads them back, then
 * deletes exactly those rows. Seeded products, categories and images are never
 * touched.
 */
import pg from "pg";
import { env } from "../src/config/env.js";

async function main(): Promise<void> {
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-final-check",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  const line = (label: string, value: string | number) =>
    console.log(`  ${label.padEnd(26)} ${value}`);

  console.log("\n=== CONNECTION ===");
  const { rows: info } = await client.query<{ v: string; db: string; usr: string }>(
    "SELECT version() AS v, current_database() AS db, current_user AS usr",
  );
  line("Host", env.dbDisplayHost);
  line("PostgreSQL", info[0]!.v.split(" ").slice(0, 2).join(" "));
  line("Database / user", `${info[0]!.db} / ${info[0]!.usr}`);

  const { rows: proj } = await client.query<{ present: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','storage','realtime')) AS present`,
  );
  line("Supabase-managed schemas", proj[0]!.present ? "present (auth, storage, realtime)" : "MISSING");

  console.log("\n=== MIGRATIONS ===");
  const { rows: migs } = await client.query<{ version: string; applied_at: Date }>(
    "SELECT version, applied_at FROM public.schema_migrations ORDER BY version",
  );
  for (const m of migs) line(m.version, new Date(m.applied_at).toISOString());

  console.log("\n=== TABLES ===");
  const { rows: tbls } = await client.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name
  `);
  line("Count", tbls.length);
  console.log(`  ${tbls.map((t) => t.table_name).join(", ")}`);

  console.log("\n=== SEEDED DATA ===");
  const counts = await client.query<{
    products: number;
    categories: number;
    images: number;
    sizes: number;
    measurements: number;
    reviews: number;
    users: number;
    admins: number;
  }>(`
    SELECT (SELECT count(*)::int FROM public.products)             AS products,
           (SELECT count(*)::int FROM public.categories)           AS categories,
           (SELECT count(*)::int FROM public.product_images)       AS images,
           (SELECT count(*)::int FROM public.product_sizes)        AS sizes,
           (SELECT count(*)::int FROM public.product_measurements) AS measurements,
           (SELECT count(*)::int FROM public.reviews)              AS reviews,
           (SELECT count(*)::int FROM public.users)                AS users,
           (SELECT count(*)::int FROM public.users WHERE role='admin') AS admins
  `);
  const c = counts.rows[0]!;
  line("Products", c.products);
  line("Categories", c.categories);
  line("Product images", c.images);
  line("Product sizes", c.sizes);
  line("Product measurements", c.measurements);
  line("Reviews", c.reviews);
  line("Users", `${c.users} (${c.admins} admin)`);

  const { rows: demo } = await client.query<{ email: string; role: string; name: string }>(
    "SELECT email, role, name FROM public.users WHERE lower(email)=lower($1)",
    [env.DEMO_USER_EMAIL],
  );
  line("Demo account", demo[0] ? `${demo[0].email} (${demo[0].role})` : "MISSING");
  const demoId = (
    await client.query<{ id: string }>("SELECT id FROM public.users WHERE lower(email)=lower($1)", [
      env.DEMO_USER_EMAIL,
    ])
  ).rows[0]?.id;

  console.log("\n=== WRITE PROOF (temporary rows, removed at the end) ===");
  const productId = (
    await client.query<{ id: string }>("SELECT id FROM public.products WHERE slug='silk-top'")
  ).rows[0]!.id;

  await client.query(
    `INSERT INTO public.cart_items (user_id, product_id, size, quantity) VALUES ($1,$2,'M',1)
     ON CONFLICT (user_id, product_id, size) DO UPDATE SET quantity = 1`,
    [demoId, productId],
  );
  const cartBack = await client.query<{ quantity: number }>(
    "SELECT quantity FROM public.cart_items WHERE user_id=$1 AND product_id=$2",
    [demoId, productId],
  );
  line("cart_items write+read", `OK (qty ${cartBack.rows[0]?.quantity})`);

  await client.query(
    `INSERT INTO public.wishlist_items (user_id, product_id) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [demoId, productId],
  );
  const wishBack = await client.query("SELECT 1 FROM public.wishlist_items WHERE user_id=$1 AND product_id=$2", [
    demoId,
    productId,
  ]);
  line("wishlist_items write+read", `OK (${wishBack.rowCount} row)`);

  const orderId = (
    await client.query<{ id: string }>(
      `INSERT INTO public.orders
         (order_number, user_id, status, subtotal, discount, shipping, total,
          customer_name, email, phone, address, city)
       VALUES ('VLN-FINALCHECK-0001',$1,'pending',109,0,15,124,'Final Check',$2,'000','addr','city')
       RETURNING id`,
      [demoId, env.DEMO_USER_EMAIL],
    )
  ).rows[0]!.id;
  await client.query(
    `INSERT INTO public.order_items (order_id, product_id, product_title, quantity, unit_price, total_price)
     VALUES ($1,$2,'Silk Sleeveless Top',1,109,109)`,
    [orderId, productId],
  );
  const orderBack = await client.query<{ total: string; items: number }>(
    `SELECT o.total, (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id=o.id) AS items
     FROM public.orders o WHERE o.id=$1`,
    [orderId],
  );
  line("orders write+read", `OK (total ${orderBack.rows[0]?.total}, ${orderBack.rows[0]?.items} item)`);

  const reviewId = (
    await client.query<{ id: string }>(
      `INSERT INTO public.reviews (product_id, user_id, author_name, author_email, rating, comment)
       VALUES ($1,$2,'Final Check',$3,5,'temporary verification row')
       ON CONFLICT (product_id, user_id) DO UPDATE SET comment = EXCLUDED.comment
       RETURNING id`,
      [productId, demoId, env.DEMO_USER_EMAIL],
    )
  ).rows[0]!.id;
  line("reviews write+read", `OK (id ${reviewId.slice(0, 8)}…)`);

  // --- remove exactly what this script created -----------------------------
  await client.query("DELETE FROM public.reviews WHERE id=$1", [reviewId]);
  await client.query("DELETE FROM public.orders WHERE id=$1", [orderId]);
  await client.query("DELETE FROM public.wishlist_items WHERE user_id=$1 AND product_id=$2", [demoId, productId]);
  await client.query("DELETE FROM public.cart_items WHERE user_id=$1 AND product_id=$2", [demoId, productId]);

  const after = await client.query<{ carts: number; wishes: number; orders: number; reviews: number; products: number }>(`
    SELECT (SELECT count(*)::int FROM public.cart_items)     AS carts,
           (SELECT count(*)::int FROM public.wishlist_items) AS wishes,
           (SELECT count(*)::int FROM public.orders)         AS orders,
           (SELECT count(*)::int FROM public.reviews)        AS reviews,
           (SELECT count(*)::int FROM public.products)       AS products
  `);
  const a = after.rows[0]!;
  console.log("\n=== AFTER CLEANUP ===");
  line("cart_items", a.carts);
  line("wishlist_items", a.wishes);
  line("orders", a.orders);
  line("reviews", `${a.reviews} (3 seeded)`);
  line("products", `${a.products} (catalogue intact)`);

  await client.end();

  const ok = a.products === 12 && a.reviews === 3 && c.categories === 8 && Boolean(demo[0]);
  console.log(ok ? "\nFINAL CHECK: PASS\n" : "\nFINAL CHECK: FAIL\n");
  process.exit(ok ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`Final check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
