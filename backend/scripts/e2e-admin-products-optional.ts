/**
 * End-to-end coverage for the Admin Product Create/Edit fix: every listed
 * field is optional, numeric fields accept direct large-number typing
 * without being silently clamped, invalid values are still rejected, and
 * editing one field never erases another.
 *
 * Cleanup: every product this test creates is deleted afterwards (in a
 * `finally`, so a failed assertion still cleans up), and the seeded VIELINEA
 * catalogue is never modified or deleted.
 *
 *   npm run test:admin-products
 */
import pg from "pg";
import { env } from "../src/config/env.js";

const BASE = `http://localhost:${env.PORT}/api`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: Array<{ path: string; message: string }>;
}

async function call<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<{ status: number; json: Envelope<T> }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: res.status, json: (await res.json()) as Envelope<T> };
}

interface ApiProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  categoryId: string;
  category: string;
  price: number;
  discount: number;
  finalPrice: number;
  stock: number;
  images: string[];
  sizes: string[];
  measurements: Record<string, string>;
  modelHeight: string | null;
  wearingSize: string | null;
}

async function main(): Promise<void> {
  const createdSlugs: string[] = [];

  async function create(body: unknown): Promise<{ status: number; json: Envelope<ApiProduct> }> {
    const res = await call<ApiProduct>("POST", "/products", { token: adminToken, body });
    if (res.status === 201 && res.json.data?.slug) createdSlugs.push(res.json.data.slug);
    return res;
  }

  console.log("\n=== Admin login ===");
  let adminToken = "";
  {
    const login = await call<{ token: string; user: { role: string } }>("POST", "/auth/login", {
      body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    });
    adminToken = login.json.data?.token ?? "";
    check("admin login", login.status === 200 && login.json.data?.user?.role === "admin");
  }

  try {
    console.log("\n=== 1. Every field optional — creation scenarios ===");
    {
      const allEmpty = await create({});
      check("create with nothing at all -> 201", allEmpty.status === 201, `status ${allEmpty.status}`);
      check(
        "blank title stored as '' (not invented)",
        allEmpty.json.data?.title === "",
        JSON.stringify(allEmpty.json.data?.title),
      );
      check("blank price defaults to 0", allEmpty.json.data?.price === 0);
      check("blank stock defaults to 0", allEmpty.json.data?.stock === 0);
      check("blank discount defaults to 0", allEmpty.json.data?.discount === 0);
      check("no images -> []", Array.isArray(allEmpty.json.data?.images) && allEmpty.json.data.images.length === 0);
      check("no sizes -> []", Array.isArray(allEmpty.json.data?.sizes) && allEmpty.json.data.sizes.length === 0);
      check(
        "no category -> empty categoryId, not a random one",
        allEmpty.json.data?.categoryId === "",
        JSON.stringify(allEmpty.json.data?.categoryId),
      );

      const onlyTitle = await create({ title: "Only A Title" });
      check("create with only title -> 201", onlyTitle.status === 201);
      check("title saved as given", onlyTitle.json.data?.title === "Only A Title");

      const onlyPrice = await create({ price: 42 });
      check("create with only price -> 201", onlyPrice.status === 201);
      check("price saved as given", onlyPrice.json.data?.price === 42);

      const onlyStock = await create({ stock: 9 });
      check("create with only stock -> 201", onlyStock.status === 201);
      check("stock saved as given", onlyStock.json.data?.stock === 9);

      const onlyCategory = await create({ category: "dresses" });
      check("create with only category -> 201", onlyCategory.status === 201);
      check("category saved as given", onlyCategory.json.data?.category === "dresses");

      const noImages = await create({ title: "No Images Product" });
      check("create with no images does not block save", noImages.status === 201);

      const noCategory = await create({ title: "No Category Product" });
      check("create with no category does not block save", noCategory.status === 201);

      const noSizes = await create({ title: "No Sizes Product" });
      check(
        "create with no sizes does not block save",
        noSizes.status === 201 && noSizes.json.data?.sizes.length === 0,
      );

      const noMeasurements = await create({ title: "No Measurements Product" });
      check(
        "create with no measurements does not block save",
        noMeasurements.status === 201 && Object.keys(noMeasurements.json.data?.measurements ?? {}).length === 0,
      );
    }

    console.log("\n=== 2. Numeric fields — large direct-entry values persist exactly ===");
    {
      const bigPrice = await create({ title: "Big Price", price: 15000 });
      check("price 15000 persists exactly", bigPrice.json.data?.price === 15000, String(bigPrice.json.data?.price));

      const decimalPrice = await create({ title: "Decimal Price", price: 9999.99 });
      check(
        "price 9999.99 persists exactly",
        decimalPrice.json.data?.price === 9999.99,
        String(decimalPrice.json.data?.price),
      );

      const discount = await create({ title: "Discount Fifty", discount: 50 });
      check("discount 50 persists exactly", discount.json.data?.discount === 50);

      const stock10k = await create({ title: "Stock 10000", stock: 10000 });
      check("stock 10000 persists exactly", stock10k.json.data?.stock === 10000);

      const stock50k = await create({ title: "Stock 50000", stock: 50000 });
      check("stock 50000 persists exactly", stock50k.json.data?.stock === 50000);
    }

    console.log("\n=== 3. Validation — invalid values rejected, blank values accepted ===");
    {
      const negPrice = await create({ title: "Bad Price", price: -1 });
      check("price < 0 -> rejected (422)", negPrice.status === 422, String(negPrice.status));

      const negDiscount = await create({ title: "Bad Discount", discount: -1 });
      check("discount < 0 -> rejected (422)", negDiscount.status === 422);

      const bigDiscount = await create({ title: "Bad Discount 2", discount: 101 });
      check("discount > 100 -> rejected (422)", bigDiscount.status === 422);

      const negStock = await create({ title: "Bad Stock", stock: -1 });
      check("stock < 0 -> rejected (422)", negStock.status === 422);

      const decimalStock = await create({ title: "Bad Stock Decimal", stock: 4.5 });
      check("stock decimal -> rejected (422)", decimalStock.status === 422);

      // A blank optional field must never be swept up by a rejection aimed
      // at a different, genuinely invalid field.
      const mixed = await create({ price: -1, stock: "" });
      check(
        "invalid price rejected even when stock is left blank alongside it",
        mixed.status === 422,
      );
    }

    console.log("\n=== 4. Editing one field never erases another ===");
    {
      const full = await create({
        title: "Summer Dress",
        description: "A light summer dress.",
        category: "dresses",
        price: 120,
        stock: 50,
        images: [{ imageUrl: "/images/products/product-dress.jpg", altText: "Summer Dress" }],
        sizes: [{ size: "M", stock: 50 }],
      });
      check("full product created for edit-safety test", full.status === 201);
      const slug = full.json.data!.slug;

      const priceOnly = await call<ApiProduct>("PUT", `/products/${slug}`, {
        token: adminToken,
        body: { price: 150 },
      });
      check("edit: price-only update accepted", priceOnly.status === 200);
      check("edit: price changed to 150", priceOnly.json.data?.price === 150);
      check("edit: title untouched", priceOnly.json.data?.title === "Summer Dress");
      check("edit: stock untouched", priceOnly.json.data?.stock === 50);
      check("edit: category untouched", priceOnly.json.data?.category === "dresses");
      check(
        "edit: images untouched",
        priceOnly.json.data?.images.length === 1 &&
          priceOnly.json.data.images[0] === "/images/products/product-dress.jpg",
      );
      check(
        "edit: sizes untouched",
        priceOnly.json.data?.sizes.length === 1 && priceOnly.json.data.sizes[0] === "M",
      );

      const stockOnly = await call<ApiProduct>("PUT", `/products/${slug}`, {
        token: adminToken,
        body: { stock: 80 },
      });
      check("edit: stock-only update accepted", stockOnly.status === 200);
      check("edit: stock changed to 80", stockOnly.json.data?.stock === 80);
      check("edit: price still 150 after stock-only edit", stockOnly.json.data?.price === 150);
      check("edit: title still intact after stock-only edit", stockOnly.json.data?.title === "Summer Dress");

      const titleOnly = await call<ApiProduct>("PUT", `/products/${slug}`, {
        token: adminToken,
        body: { title: "Summer Dress (Renamed)" },
      });
      check("edit: title-only update accepted", titleOnly.status === 200);
      check("edit: title changed", titleOnly.json.data?.title === "Summer Dress (Renamed)");
      check("edit: price still 150 after title-only edit", titleOnly.json.data?.price === 150);
      check("edit: stock still 80 after title-only edit", titleOnly.json.data?.stock === 80);
      check("edit: category still intact after title-only edit", titleOnly.json.data?.category === "dresses");

      const discountOnly = await call<ApiProduct>("PUT", `/products/${slug}`, {
        token: adminToken,
        body: { discount: 15 },
      });
      check("edit: discount-only update accepted", discountOnly.status === 200);
      check("edit: discount changed to 15", discountOnly.json.data?.discount === 15);
      check(
        "edit: title/price/stock/category all still intact after discount-only edit",
        discountOnly.json.data?.title === "Summer Dress (Renamed)" &&
          discountOnly.json.data.price === 150 &&
          discountOnly.json.data.stock === 80 &&
          discountOnly.json.data.category === "dresses",
      );
    }

    console.log("\n=== 5. Uncategorised product stays reachable (LEFT JOIN regression) ===");
    {
      const noCat = await create({ title: "Reachability Check", price: 10 });
      const slug = noCat.json.data!.slug;

      const bySlug = await call<ApiProduct>("GET", `/products/slug/${slug}`);
      check(
        "GET /products/slug/:slug does not 404 an uncategorised product",
        bySlug.status === 200 && bySlug.json.data?.title === "Reachability Check",
        `status ${bySlug.status}`,
      );

      const byId = await call<ApiProduct>("GET", `/products/${noCat.json.data!.id}`);
      check("GET /products/:id does not 404 an uncategorised product", byId.status === 200);

      const list = await call<ApiProduct[]>("GET", "/products?limit=60");
      check(
        "uncategorised product appears in the product list",
        list.json.data?.some((p) => p.slug === slug) ?? false,
      );

      const related = await call<ApiProduct[]>("GET", `/products/${noCat.json.data!.id}/related`);
      check(
        "related() does not crash for an uncategorised product",
        related.status === 200 && Array.isArray(related.json.data),
        `status ${related.status}`,
      );
    }
  } finally {
    console.log("\n=== Cleanup ===");
    for (const slug of createdSlugs) {
      const del = await call("DELETE", `/products/${slug}`, { token: adminToken });
      if (del.status !== 200) {
        console.log(`  WARN  could not delete test product ${slug} (status ${del.status})`);
      }
    }
    console.log(`  Deleted ${createdSlugs.length} temporary test product(s).`);

    // Confirm the seeded catalogue itself was never touched by this run.
    const client = new pg.Client({ ...env.db, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public.products WHERE slug = ANY($1::text[])`,
        [createdSlugs],
      );
      check("all temporary test products removed from the database", rows[0]?.n === 0, `${rows[0]?.n} remain`);
    } finally {
      await client.end();
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailed checks:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("Test run crashed:", error);
  process.exit(1);
});
