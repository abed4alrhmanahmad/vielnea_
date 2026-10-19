/**
 * End-to-end API test against the running server and the real Supabase
 * database. Exercises every storefront flow, including a full checkout.
 *
 * Cleanup: the temporary registered user and any rows it created are deleted at
 * the end, and product stock consumed by the checkout test is restored. Seeded
 * VIELINEA products, categories and images are never modified or deleted.
 */
import pg from "pg";
import { env } from "../src/config/env.js";

const BASE = `http://localhost:${env.PORT}/api`;
/**
 * A card token of the shape the browser produces: the provider's reference
 * plus the safe descriptors. There is deliberately no card number or CVV here
 * — those never leave the browser and the API has no field for them. Last4
 * 4242 is approved by the sandbox provider.
 */
const TEST_CARD = {
  token: "cardtok_e2e_approved",
  brand: "visa",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2031,
};


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
  pagination?: { total: number; page: number; totalPages: number; limit: number };
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
  const json = (await res.json()) as Envelope<T>;
  return { status: res.status, json };
}

interface Product {
  id: string;
  slug: string;
  title: string;
  price: number;
  discount: number;
  finalPrice: number;
  stock: number;
  sizes: string[];
  images: string[];
  measurements: Record<string, string>;
  category: string;
  rating: number;
  reviewCount: number;
  modelHeight: string | null;
  wearingSize: string | null;
}

async function main(): Promise<void> {
  const testEmail = `e2e-${Date.now()}@vielinea.test`;

  console.log("\n=== 1. HEALTH ===");
  {
    const { json } = await call<{ status: string }>("GET", "/health");
    check("GET /health", json.success && json.data.status === "ok");
    const db = await call<{ database: string }>("GET", "/health/db");
    check("GET /health/db", db.json.success, db.json.data?.database);
  }

  console.log("\n=== 2. PRODUCTS: list, search, filter, sort, paginate ===");
  let sample: Product | undefined;
  // The catalogue is a live database, not a fixture — an admin may have added
  // products since seeding. Assertions are relative to what is actually there.
  let baselineProducts = 0;
  let baselineDresses = 0;
  {
    const { json } = await call<Product[]>("GET", "/products?limit=60");
    baselineProducts = json.data.length;
    check(
      "GET /products returns the seeded catalogue or more",
      baselineProducts >= 12,
      `${baselineProducts} products`,
    );
    check("pagination metadata present", json.pagination?.total === baselineProducts);
    sample = json.data.find((p) => p.slug === "linen-midi-dress");
    check("product has images", (sample?.images.length ?? 0) === 3, sample?.images[0]);
    check("product has sizes", (sample?.sizes.length ?? 0) === 5, sample?.sizes.join("/"));
    check(
      "measurements preserved verbatim",
      sample?.measurements["Sleeve Length"] === "25 cm" && sample?.measurements["Hip"] === "104 cm",
      JSON.stringify(sample?.measurements),
    );
    check("model info present", sample?.modelHeight === "170 cm" && sample?.wearingSize === "M");

    // The rating on a product is derived from its visible reviews (migration
    // 0008), so assert the derivation rather than a fixed seeded number.
    const ratingSource = await call<{ stats: { count: number; average: number } }>(
      "GET",
      "/products/linen-midi-dress/reviews",
    );
    check(
      "product rating is derived from its reviews",
      Math.abs((sample?.rating ?? -1) - ratingSource.json.data.stats.average) < 0.05 &&
        sample?.reviewCount === ratingSource.json.data.stats.count,
      `product ${sample?.rating}/${sample?.reviewCount} vs reviews ${ratingSource.json.data.stats.average}/${ratingSource.json.data.stats.count}`,
    );

    const search = await call<Product[]>("GET", "/products?search=dress");
    check(
      "search=dress",
      search.json.data.length > 0 && search.json.data.every((p) => /dress/i.test(p.title + p.slug + p.category)),
      `${search.json.data.length} hits`,
    );

    const cat = await call<Product[]>("GET", "/products?category=dresses");
    baselineDresses = cat.json.data.length;
    check(
      "category=dresses returns only dresses",
      baselineDresses >= 2 && cat.json.data.every((p) => p.category === "dresses"),
      `${baselineDresses} products`,
    );

    const asc = await call<Product[]>("GET", "/products?sort=price_asc&limit=60");
    const ascPrices = asc.json.data.map((p) => p.finalPrice);
    check(
      "sort=price_asc ascending",
      ascPrices.every((v, i) => i === 0 || ascPrices[i - 1]! <= v),
      `${ascPrices[0]} … ${ascPrices[ascPrices.length - 1]}`,
    );

    const desc = await call<Product[]>("GET", "/products?sort=price-desc&limit=60");
    const descPrices = desc.json.data.map((p) => p.finalPrice);
    check(
      "sort=price-desc (frontend alias) descending",
      descPrices.every((v, i) => i === 0 || descPrices[i - 1]! >= v),
      `${descPrices[0]} … ${descPrices[descPrices.length - 1]}`,
    );

    const rated = await call<Product[]>("GET", "/products?sort=rating&limit=5");
    const ratings = rated.json.data.map((p) => p.rating);
    check(
      "sort=rating descending",
      ratings.every((v, i) => i === 0 || ratings[i - 1]! >= v),
      ratings.join(" >= "),
    );

    const p1 = await call<Product[]>("GET", "/products?page=1&limit=8");
    const p2 = await call<Product[]>("GET", "/products?page=2&limit=8");
    const overlap = p1.json.data.filter((a) => p2.json.data.some((b) => b.id === a.id));
    const expectedPage2 = Math.min(8, Math.max(0, baselineProducts - 8));
    check(
      "pagination splits the catalogue with no overlap",
      p1.json.data.length === Math.min(8, baselineProducts) &&
        p2.json.data.length === expectedPage2 &&
        overlap.length === 0,
      `page1=${p1.json.data.length} page2=${p2.json.data.length} totalPages=${p1.json.pagination?.totalPages}`,
    );

    const combined = await call<Product[]>(
      "GET",
      "/products?category=handbags&minPrice=150&maxPrice=300&sort=price_asc",
    );
    check(
      "combined filters (category+price range+sort)",
      combined.json.data.length > 0 &&
        combined.json.data.every((p) => p.category === "handbags" && p.finalPrice >= 150 && p.finalPrice <= 300),
      `${combined.json.data.length} products`,
    );

    const bySlug = await call<Product>("GET", "/products/slug/linen-midi-dress");
    check("GET /products/slug/:slug", bySlug.json.data.slug === "linen-midi-dress");

    const byId = await call<Product>("GET", `/products/${sample!.id}`);
    check("GET /products/:uuid", byId.json.data.slug === "linen-midi-dress");

    const related = await call<Product[]>("GET", "/products/linen-midi-dress/related");
    check(
      "related products same category, excludes self",
      related.json.data.length > 0 &&
        related.json.data.every((p) => p.category === "dresses" && p.slug !== "linen-midi-dress"),
      `${related.json.data.length} related`,
    );

    const missing = await call("GET", "/products/slug/does-not-exist");
    check("unknown slug -> 404", missing.status === 404);
  }

  console.log("\n=== 3. CATEGORIES ===");
  {
    const { json } = await call<Array<{ slug: string; label: string; productCount: number }>>(
      "GET",
      "/categories",
    );
    check("GET /categories returns 8", json.data.length === 8, json.data.map((c) => c.slug).join(","));
    const dresses = json.data.find((c) => c.slug === "dresses");
    check(
      "category product count agrees with the product query",
      dresses?.productCount === baselineDresses,
      `dresses=${dresses?.productCount}`,
    );
    const one = await call<{ slug: string }>("GET", "/categories/dresses");
    check("GET /categories/:slug", one.json.data.slug === "dresses");
  }

  console.log("\n=== 4. AUTH ===");
  let token = "";
  let demoUserId = "";
  {
    const bad = await call("POST", "/auth/login", {
      body: { email: "demo@vielinea.com", password: "wrong-password" },
    });
    check("login with wrong password -> 401", bad.status === 401);

    const login = await call<{ token: string; user: { id: string; email: string; role: string } }>(
      "POST",
      "/auth/login",
      { body: { email: "demo@vielinea.com", password: "123456" } },
    );
    token = login.json.data?.token ?? "";
    demoUserId = login.json.data?.user?.id ?? "";
    check(
      "POST /auth/login demo account",
      login.status === 200 && Boolean(token) && login.json.data.user.role === "customer",
      login.json.data?.user?.email,
    );

    const me = await call<{ user: { email: string; role: string } }>("GET", "/auth/me", { token });
    check("GET /auth/me", me.json.data?.user?.email === "demo@vielinea.com", me.json.data?.user?.role);

    const noAuth = await call("GET", "/auth/me");
    check("GET /auth/me without token -> 401", noAuth.status === 401);

    const reg = await call<{ token: string; user: { email: string; role: string } }>(
      "POST",
      "/auth/register",
      { body: { name: "E2E Test User", email: testEmail, password: "test123456" } },
    );
    check(
      "POST /auth/register",
      reg.status === 201 && reg.json.data.user.role === "customer",
      reg.json.data?.user?.email,
    );

    const dupe = await call("POST", "/auth/register", {
      body: { name: "Dupe", email: testEmail, password: "test123456" },
    });
    check("duplicate registration -> 409", dupe.status === 409);
  }

  console.log("\n=== 5. ADMIN AUTHORIZATION ===");
  {
    const asCustomer = await call("POST", "/products", {
      token,
      body: { title: "Should Not Exist", category: "dresses", price: 1 },
    });
    check("customer cannot POST /products -> 403", asCustomer.status === 403);

    const anon = await call("DELETE", "/products/linen-midi-dress");
    check("anonymous cannot DELETE product -> 401", anon.status === 401);
  }

  console.log("\n=== 6. WISHLIST ===");
  {
    await call("DELETE", "/wishlist/linen-midi-dress", { token });

    const add = await call<Array<{ slug: string }>>("POST", "/wishlist", {
      token,
      body: { productId: "linen-midi-dress" },
    });
    check("POST /wishlist", add.status === 201 && add.json.data.some((w) => w.slug === "linen-midi-dress"));

    const list = await call<Array<{ slug: string; product: Product }>>("GET", "/wishlist", { token });
    check(
      "GET /wishlist returns product data",
      list.json.data[0]?.product?.title === "Linen Midi Wrap Dress",
    );

    const toggleOff = await call<{ wishlisted: boolean }>("POST", "/wishlist/toggle", {
      token,
      body: { productId: "linen-midi-dress" },
    });
    check("toggle removes", toggleOff.json.data.wishlisted === false);

    const toggleOn = await call<{ wishlisted: boolean }>("POST", "/wishlist/toggle", {
      token,
      body: { productId: "linen-midi-dress" },
    });
    check("toggle re-adds", toggleOn.json.data.wishlisted === true);

    const del = await call<unknown[]>("DELETE", "/wishlist/linen-midi-dress", { token });
    check("DELETE /wishlist/:productId", del.json.data.length === 0);
  }

  console.log("\n=== 7. CART ===");
  {
    await call("DELETE", "/cart", { token });

    const empty = await call<{ items: unknown[]; subtotal: number }>("GET", "/cart", { token });
    check("cart starts empty", empty.json.data.items.length === 0 && empty.json.data.subtotal === 0);

    const add = await call<{ items: Array<{ size: string; quantity: number; unitPrice: number }>; subtotal: number }>(
      "POST",
      "/cart",
      { token, body: { productId: "linen-midi-dress", size: "M", quantity: 2 } },
    );
    check(
      "POST /cart adds line",
      add.status === 201 && add.json.data.items[0]?.quantity === 2,
      `subtotal=${add.json.data.subtotal}`,
    );
    check(
      "unit price read from database (189, 0% off)",
      add.json.data.items[0]?.unitPrice === 189,
      String(add.json.data.items[0]?.unitPrice),
    );

    const badSize = await call("POST", "/cart", {
      token,
      body: { productId: "linen-midi-dress", size: "XXXL", quantity: 1 },
    });
    check("invalid size rejected -> 400", badSize.status === 400, badSize.json.message);

    const overStock = await call("PUT", "/cart/linen-midi-dress", {
      token,
      body: { size: "M", quantity: 99 },
    });
    check("quantity beyond stock rejected -> 400", overStock.status === 400, overStock.json.message);

    const upd = await call<{ items: Array<{ quantity: number }> }>("PUT", "/cart/linen-midi-dress", {
      token,
      body: { size: "M", quantity: 3 },
    });
    check("PUT /cart/:productId updates quantity", upd.json.data.items[0]?.quantity === 3);

    // Discounted product proves the discount is applied server-side.
    const discounted = await call<{ items: Array<{ slug: string; unitPrice: number }>; subtotal: number; discount: number }>(
      "POST",
      "/cart",
      { token, body: { productId: "satin-dress", size: "S", quantity: 1 } },
    );
    const satin = discounted.json.data.items.find((i) => i.slug === "satin-dress");
    check(
      "discount applied server-side (179 - 20% = 143.20)",
      satin?.unitPrice === 143.2,
      String(satin?.unitPrice),
    );
    check("cart reports discount total", discounted.json.data.discount > 0, String(discounted.json.data.discount));

    const zero = await call<{ items: unknown[] }>("PUT", "/cart/satin-dress", {
      token,
      body: { size: "S", quantity: 0 },
    });
    check("quantity 0 removes the line", zero.json.data.items.length === 1);

    const anon = await call("GET", "/cart");
    check("cart requires auth -> 401", anon.status === 401);
  }

  console.log("\n=== 8. CHECKOUT (server-calculated, price tampering ignored) ===");
  let orderId = "";
  let orderTotalExpected = 0;
  {
    const before = await call<{ subtotal: number; total: number; items: Array<{ quantity: number }> }>(
      "GET",
      "/cart",
      { token },
    );
    orderTotalExpected = before.json.data.total;

    const stockBefore = await call<Product>("GET", "/products/slug/linen-midi-dress");

    // Deliberately send bogus money/quantity fields — they must be ignored.
    const order = await call<{
      id: string;
      orderNumber: string;
      subtotal: number;
      total: number;
      shipping: number;
      status: string;
      items: Array<{ productTitle: string; quantity: number; unitPrice: number; totalPrice: number }>;
    }>("POST", "/orders", {
      token,
      body: {
        customerName: "Demo Guest",
        email: "demo@vielinea.com",
        phone: "+961 70 000 000",
        address: "12 Rue Saint-Honoré",
        city: "Beirut",
        postalCode: "1103",
        country: "Lebanon",
        notes: "E2E test order",
        paymentMethod: "card",
        card: TEST_CARD,
        // hostile extras:
        subtotal: 0.01,
        total: 0.01,
        price: 0.01,
        items: [{ productId: "linen-midi-dress", quantity: 999, unitPrice: 0.01 }],
      },
    });

    orderId = order.json.data?.id ?? "";
    check("POST /orders creates order", order.status === 201 && Boolean(orderId), order.json.data?.orderNumber);
    check(
      "frontend-supplied total IGNORED — server total used",
      order.json.data.total === orderTotalExpected && order.json.data.total !== 0.01,
      `server=${order.json.data.total} vs sent=0.01`,
    );
    check(
      "frontend-supplied items IGNORED — order built from DB cart",
      order.json.data.items.length === 1 && order.json.data.items[0]?.quantity === 3,
      `${order.json.data.items.length} line(s), qty ${order.json.data.items[0]?.quantity}`,
    );
    check(
      "line unit price from database",
      order.json.data.items[0]?.unitPrice === 189 && order.json.data.items[0]?.totalPrice === 567,
      `${order.json.data.items[0]?.unitPrice} x3 = ${order.json.data.items[0]?.totalPrice}`,
    );
    check(
      "standard shipping charged on every order",
      order.json.data.shipping > 0 &&
        order.json.data.total === order.json.data.subtotal + order.json.data.shipping,
      `subtotal=${order.json.data.subtotal} shipping=${order.json.data.shipping} total=${order.json.data.total}`,
    );

    const cartAfter = await call<{ items: unknown[] }>("GET", "/cart", { token });
    check("cart cleared after checkout", cartAfter.json.data.items.length === 0);

    const stockAfter = await call<Product>("GET", "/products/slug/linen-midi-dress");
    check(
      "stock decremented by ordered quantity",
      stockAfter.json.data.stock === stockBefore.json.data.stock - 3,
      `${stockBefore.json.data.stock} -> ${stockAfter.json.data.stock}`,
    );

    const emptyCheckout = await call("POST", "/orders", {
      token,
      body: {
        customerName: "Demo Guest",
        email: "demo@vielinea.com",
        phone: "123456",
        address: "12 Rue Saint-Honoré",
        city: "Beirut",
      },
    });
    check("checkout with empty bag -> 400", emptyCheckout.status === 400, emptyCheckout.json.message);
  }

  console.log("\n=== 9. ORDERS ===");
  {
    const list = await call<Array<{ id: string; orderNumber: string }>>("GET", "/orders", { token });
    check("GET /orders lists the order", list.json.data.some((o) => o.id === orderId), `${list.json.data.length} order(s)`);

    const one = await call<{ id: string; total: number; items: unknown[] }>("GET", `/orders/${orderId}`, { token });
    check("GET /orders/:id", one.json.data.id === orderId && one.json.data.total === orderTotalExpected);

    // Another user must not be able to read this order.
    const other = await call<{ token: string }>("POST", "/auth/login", {
      body: { email: testEmail, password: "test123456" },
    });
    const stolen = await call("GET", `/orders/${orderId}`, { token: other.json.data.token });
    check("another customer cannot read the order -> 404", stolen.status === 404);
  }

  console.log("\n=== 10. REVIEWS ===");
  let reviewId = "";
  {
    const list = await call<{ reviews: Array<{ id: string; rating: number }>; stats: { count: number; average: number } }>(
      "GET",
      "/products/linen-midi-dress/reviews",
    );
    check("GET reviews (seeded)", list.json.data.stats.count === 2, `avg ${list.json.data.stats.average.toFixed(1)}`);

    const badRating = await call("POST", "/products/linen-midi-dress/reviews", {
      token,
      body: { rating: 9, comment: "out of range" },
    });
    check("rating outside 1-5 rejected -> 422", badRating.status === 422);

    const created = await call<{ id: string; rating: number; verified: boolean }>(
      "POST",
      "/products/linen-midi-dress/reviews",
      { token, body: { rating: 5, comment: "E2E test review — exceptional fabric." } },
    );
    reviewId = created.json.data?.id ?? "";
    check("POST review", created.status === 201 && created.json.data.rating === 5);
    check(
      "verified flag derived from purchase history",
      created.json.data.verified === true,
      "demo user just ordered this product",
    );

    const upsert = await call<{ id: string; rating: number }>(
      "POST",
      "/products/linen-midi-dress/reviews",
      { token, body: { rating: 4, comment: "E2E test review — updated." } },
    );
    check("second review updates rather than duplicates", upsert.json.data.id === reviewId && upsert.json.data.rating === 4);

    const helpful = await call<{ voted: boolean; review: { helpfulCount: number } }>(
      "POST",
      `/products/linen-midi-dress/reviews/${reviewId}/helpful`,
      { token },
    );
    check("helpful vote recorded", helpful.json.data.voted && helpful.json.data.review.helpfulCount === 1);

    const unvote = await call<{ voted: boolean; review: { helpfulCount: number } }>(
      "POST",
      `/products/linen-midi-dress/reviews/${reviewId}/helpful`,
      { token },
    );
    check("helpful vote toggles off", !unvote.json.data.voted && unvote.json.data.review.helpfulCount === 0);

    const del = await call("DELETE", `/products/linen-midi-dress/reviews/${reviewId}`, { token });
    check("DELETE own review", del.status === 200);
  }

  console.log("\n=== 11. CONTACT + NEWSLETTER ===");
  {
    const invalid = await call("POST", "/contact", { body: { name: "x", email: "nope", message: "hi" } });
    check("contact validation -> 422", invalid.status === 422);

    const contact = await call<{ id: string; message: string }>("POST", "/contact", {
      body: {
        name: "E2E Tester",
        email: testEmail,
        subject: "E2E test",
        message: "This is an automated end-to-end test message.",
      },
    });
    check("POST /contact stores message", contact.status === 201 && Boolean(contact.json.data.id));

    const sub = await call<{ alreadySubscribed: boolean }>("POST", "/newsletter", {
      body: { email: testEmail, source: "e2e" },
    });
    check("POST /newsletter subscribes", sub.status === 201 && sub.json.data.alreadySubscribed === false);

    const again = await call<{ alreadySubscribed: boolean }>("POST", "/newsletter", {
      body: { email: testEmail, source: "e2e" },
    });
    check("duplicate subscription deduped", again.json.data.alreadySubscribed === true);
  }

  console.log("\n=== 12. CLEANUP ===");
  {
    const client = new pg.Client({
      ...env.db,
      ssl: { rejectUnauthorized: false },
      application_name: "vielinea-e2e-cleanup",
      connectionTimeoutMillis: 20_000,
    });
    await client.connect();

    // Remove only rows this test created.
    const order = await client.query("DELETE FROM public.orders WHERE id = $1", [orderId]);
    const user = await client.query("DELETE FROM public.users WHERE lower(email) = lower($1)", [testEmail]);
    const msg = await client.query("DELETE FROM public.contact_messages WHERE lower(email) = lower($1)", [testEmail]);
    const news = await client.query("DELETE FROM public.newsletter_subscribers WHERE lower(email) = lower($1)", [testEmail]);
    await client.query("DELETE FROM public.cart_items WHERE user_id = $1", [demoUserId]);
    await client.query("DELETE FROM public.wishlist_items WHERE user_id = $1", [demoUserId]);
    await client.query("DELETE FROM public.reviews WHERE user_id = $1", [demoUserId]);

    console.log(
      `  removed: order=${order.rowCount} testUser=${user.rowCount} contact=${msg.rowCount} newsletter=${news.rowCount}`,
    );

    // Restore stock consumed by the checkout test.
    await client.query(
      "UPDATE public.products SET stock = 24 WHERE slug = 'linen-midi-dress' AND stock <> 24",
    );
    await client.query(
      `UPDATE public.product_sizes ps SET stock = v.stock
       FROM (VALUES ('XS',5),('S',5),('M',5),('L',5),('XL',4)) AS v(size, stock)
       WHERE ps.size = v.size
         AND ps.product_id = (SELECT id FROM public.products WHERE slug = 'linen-midi-dress')`,
    );

    const { rows } = await client.query<{ stock: number; products: number }>(`
      SELECT (SELECT stock FROM public.products WHERE slug='linen-midi-dress') AS stock,
             (SELECT count(*)::int FROM public.products) AS products
    `);
    console.log(`  catalogue restored: linen-midi-dress stock=${rows[0]?.stock}, products=${rows[0]?.products}`);
    check(
      "catalogue intact after tests",
      rows[0]?.products === baselineProducts && rows[0]?.stock === 24,
      `${rows[0]?.products} products (baseline ${baselineProducts}), stock ${rows[0]?.stock}`,
    );

    await client.end();
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`E2E RESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) console.log(`Failures:\n  - ${failures.join("\n  - ")}`);
  console.log("=".repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`E2E crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
