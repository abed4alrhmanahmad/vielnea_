/**
 * Seeds the Vielinea catalogue from the storefront's existing mock data.
 *
 * Idempotent by design: every write is an UPSERT keyed on a stable slug or
 * email, so running it repeatedly converges on the same state instead of
 * creating duplicates. It never DELETEs a product, category or user.
 *
 *   npm run db:seed
 */
import pg from "pg";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/utils/password.js";
import {
  distributeStock,
  parseMeasure,
  seedCategories,
  seedProducts,
  seedReviews,
} from "../supabase/seed/catalog.js";

async function main(): Promise<void> {
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-seed",
    connectionTimeoutMillis: 20_000,
  });

  await client.connect();
  console.log("Connected. Seeding Vielinea catalogue...\n");

  try {
    await client.query("BEGIN");

    // ---------------------------------------------------------------- users
    const accounts = [
      {
        name: "Demo Guest",
        email: env.DEMO_USER_EMAIL,
        password: env.DEMO_USER_PASSWORD,
        role: "customer" as const,
      },
      {
        name: "Vielinea Admin",
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
        role: "admin" as const,
      },
    ];

    for (const account of accounts) {
      const passwordHash = await hashPassword(account.password);
      // Existing accounts keep their current password; only the name/role are
      // reconciled, so re-seeding never resets a password someone has changed.
      await client.query(
        `INSERT INTO public.users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lower(email)) DO UPDATE
           SET name = EXCLUDED.name, role = EXCLUDED.role`,
        [account.name, account.email.toLowerCase(), passwordHash, account.role],
      );
      console.log(`  user      ${account.email} (${account.role})`);
    }

    // ----------------------------------------------------------- categories
    const categoryIds = new Map<string, string>();
    for (const category of seedCategories) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO public.categories (slug, label, description, image_url, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE
           SET label = EXCLUDED.label,
               description = EXCLUDED.description,
               image_url = EXCLUDED.image_url,
               sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [
          category.slug,
          category.label,
          category.description,
          category.imageUrl,
          category.sortOrder,
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error(`Failed to upsert category ${category.slug}`);
      categoryIds.set(category.slug, id);
    }
    console.log(`\n  categories ${categoryIds.size} upserted`);

    // ------------------------------------------------------------- products
    const productIds = new Map<string, string>();
    const now = Date.now();

    for (const [index, product] of seedProducts.entries()) {
      const categoryId = categoryIds.get(product.category);
      if (!categoryId) throw new Error(`Unknown category "${product.category}"`);

      // Stagger created_at in catalogue order so the API's default "newest"
      // sort reproduces the order the storefront shows today.
      const createdAt = new Date(now - index * 60_000).toISOString();

      // rating and review_count are deliberately not seeded. Migration 0008
      // makes them derived columns, recomputed from public.reviews by trigger.
      // Writing the catalogue's marketing figures here would put a number on
      // the product card that the reviews panel below it contradicts.
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO public.products
           (slug, title, description, category_id, price, discount, stock,
            is_featured, is_best_seller, is_new_arrival, has_gift,
            model_height, model_weight, wearing_size, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (slug) DO UPDATE
           SET title = EXCLUDED.title,
               description = EXCLUDED.description,
               category_id = EXCLUDED.category_id,
               price = EXCLUDED.price,
               discount = EXCLUDED.discount,
               stock = EXCLUDED.stock,
               is_best_seller = EXCLUDED.is_best_seller,
               is_new_arrival = EXCLUDED.is_new_arrival,
               has_gift = EXCLUDED.has_gift,
               model_height = EXCLUDED.model_height,
               model_weight = EXCLUDED.model_weight,
               wearing_size = EXCLUDED.wearing_size
         RETURNING id`,
        [
          product.slug,
          product.title,
          product.description,
          categoryId,
          product.price,
          product.discount,
          product.stock,
          product.isBestSeller,
          product.isNewArrival,
          product.hasGift,
          product.model.height,
          product.model.weight,
          product.model.wearingSize,
          createdAt,
        ],
      );

      const productId = rows[0]?.id;
      if (!productId) throw new Error(`Failed to upsert product ${product.slug}`);
      productIds.set(product.slug, productId);

      // -- images (paths into frontend/public/images/products) -------------
      for (const [i, imageUrl] of product.images.entries()) {
        await client.query(
          `INSERT INTO public.product_images (product_id, image_url, alt_text, sort_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, image_url) DO UPDATE
             SET alt_text = EXCLUDED.alt_text, sort_order = EXCLUDED.sort_order`,
          [productId, imageUrl, product.title, i],
        );
      }

      // -- sizes with distributed stock ------------------------------------
      const perSize = distributeStock(product.stock, product.sizes.length);
      for (const [i, size] of product.sizes.entries()) {
        await client.query(
          `INSERT INTO public.product_sizes (product_id, size, stock, sort_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, size) DO UPDATE
             SET stock = EXCLUDED.stock, sort_order = EXCLUDED.sort_order`,
          [productId, size, perSize[i] ?? 0, i],
        );
      }

      // -- measurements ----------------------------------------------------
      // `labels` keeps the exact label/value map the product page renders;
      // the numeric columns hold the parsed standard dimensions.
      await client.query(
        `INSERT INTO public.product_measurements
           (product_id, size, bust, waist, hips, length, labels)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (product_id, size) DO UPDATE
           SET bust = EXCLUDED.bust, waist = EXCLUDED.waist,
               hips = EXCLUDED.hips, length = EXCLUDED.length,
               labels = EXCLUDED.labels`,
        [
          productId,
          product.model.wearingSize,
          parseMeasure(product.measurements["Bust"]),
          parseMeasure(product.measurements["Waist"]),
          parseMeasure(product.measurements["Hip"] ?? product.measurements["Hips"]),
          parseMeasure(product.measurements["Length"]),
          JSON.stringify(product.measurements),
        ],
      );

      console.log(
        `  product   ${product.slug.padEnd(20)} $${String(product.price).padStart(3)} ` +
          `· ${product.images.length} img · ${product.sizes.length} sizes`,
      );
    }

    // -------------------------------------------------------------- reviews
    let reviewsInserted = 0;
    for (const review of seedReviews) {
      const productId = productIds.get(review.productSlug);
      if (!productId) continue;

      const createdAt = new Date(now - review.daysAgo * 86_400_000).toISOString();

      // Seeded reviews have no user account, so uniqueness is keyed on
      // (product, author_email) via an explicit existence check.
      const { rowCount } = await client.query(
        `INSERT INTO public.reviews
           (product_id, user_id, author_name, author_email, rating, comment,
            verified, helpful_count, created_at)
         SELECT $1, NULL, $2, $3, $4, $5, $6, $7, $8
         WHERE NOT EXISTS (
           SELECT 1 FROM public.reviews
           WHERE product_id = $1 AND lower(author_email) = lower($3)
         )`,
        [
          productId,
          review.authorName,
          review.authorEmail,
          review.rating,
          review.comment,
          review.verified,
          review.helpfulCount,
          createdAt,
        ],
      );
      reviewsInserted += rowCount ?? 0;
    }
    console.log(
      `\n  reviews    ${reviewsInserted} inserted, ${seedReviews.length - reviewsInserted} already present`,
    );

    await client.query("COMMIT");
    console.log("\nSeed complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nSeed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
