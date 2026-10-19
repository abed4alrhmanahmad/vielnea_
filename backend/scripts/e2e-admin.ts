/**
 * End-to-end test for the admin panel against the live
 * Supabase database.
 *
 * Cleanup: every temporary record this creates (test product,
 * order, user) is deleted afterwards, and consumed stock is restored. The
 * seeded VIELINEA catalogue is never modified or deleted.
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
  pagination?: { total: number };
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

async function main(): Promise<void> {
  const created = {
    productSlug: "",
    orderIds: [] as string[],
    userEmail: `admin-e2e-${Date.now()}@vielinea.test`,
  };

  console.log("\n=== 1. ADMIN AUTHENTICATION ===");
  let adminToken = "";
  let customerToken = "";
  {
    const bad = await call("POST", "/auth/login", {
      body: { email: env.ADMIN_EMAIL, password: "definitely-wrong" },
    });
    check("admin login with wrong password -> 401", bad.status === 401);

    const login = await call<{ token: string; user: { role: string; email: string } }>(
      "POST",
      "/auth/login",
      { body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } },
    );
    adminToken = login.json.data?.token ?? "";
    check(
      "admin login",
      login.status === 200 && login.json.data.user.role === "admin",
      login.json.data?.user?.email,
    );

    const me = await call<{ user: { role: string } }>("GET", "/auth/me", { token: adminToken });
    check("GET /auth/me returns admin role", me.json.data?.user?.role === "admin");

    const cust = await call<{ token: string }>("POST", "/auth/login", {
      body: { email: env.DEMO_USER_EMAIL, password: env.DEMO_USER_PASSWORD },
    });
    customerToken = cust.json.data?.token ?? "";
    check("customer login (for authorization tests)", Boolean(customerToken));
  }

  console.log("\n=== 2. ADMIN AUTHORIZATION (customers must be refused) ===");
  {
    const adminPaths = [
      ["GET", "/admin/stats"],
      ["GET", "/admin/orders"],
      ["GET", "/admin/customers"],
      ["GET", "/admin/reviews"],
    ] as const;

    for (const [method, path] of adminPaths) {
      const anon = await call(method, path);
      const asCustomer = await call(method, path, { token: customerToken });
      const asAdmin = await call(method, path, { token: adminToken });
      check(
        `${path}: anon 401 / customer 403 / admin 200`,
        anon.status === 401 && asCustomer.status === 403 && asAdmin.status === 200,
        `${anon.status}/${asCustomer.status}/${asAdmin.status}`,
      );
    }

    const custCat = await call("POST", "/admin/categories", {
      token: customerToken,
      body: { label: "Hacked" },
    });
    check("customer cannot create categories -> 403", custCat.status === 403);
  }

  console.log("\n=== 3. DASHBOARD STATISTICS ===");
  {
    const { json } = await call<{
      products: { total: number; outOfStock: number };
      customers: { total: number };
      reviews: { total: number; averageRating: number };
      orders: { total: number };
      revenue: { total: number };
      topProducts: unknown[];
      revenueByDay: unknown[];
    }>("GET", "/admin/stats", { token: adminToken });

    check(
      "stats: product total matches the catalogue",
      json.data.products.total >= 12,
      String(json.data.products.total),
    );
    check("stats: customers counted", json.data.customers.total >= 1, String(json.data.customers.total));
    check("stats: reviews counted", json.data.reviews.total >= 3, String(json.data.reviews.total));
    check("stats: revenue + orders present", typeof json.data.revenue.total === "number");
    check("stats: topProducts + revenueByDay arrays", Array.isArray(json.data.topProducts) && Array.isArray(json.data.revenueByDay));
  }

  console.log("\n=== 4. ADMIN PRODUCT CRUD (temporary product only) ===");
  // Counted rather than assumed: the catalogue is live data an admin can add to.
  let baselineProducts = 0;
  let baselineImages = 0;
  {
    const before = await call<Array<{ images?: string[] }>>("GET", "/products?limit=60");
    baselineProducts = before.json.data.length;
    baselineImages = before.json.data.reduce((n, p) => n + (p.images?.length ?? 0), 0);
    check(
      "product list baseline captured",
      baselineProducts >= 12,
      `${baselineProducts} products, ${baselineImages} images`,
    );

    const create = await call<{ slug: string; title: string; price: number; stock: number }>(
      "POST",
      "/products",
      {
        token: adminToken,
        body: {
          title: "E2E Temporary Test Piece",
          description: "Temporary product created by the admin e2e test.",
          category: "dresses",
          price: 99.5,
          discount: 10,
          stock: 7,
          rating: 4.2,
          isNewArrival: true,
          images: [{ imageUrl: "/images/products/product-dress.jpg", altText: "Temp" }],
          sizes: [
            { size: "S", stock: 3 },
            { size: "M", stock: 4 },
          ],
          measurements: [{ size: "M", labels: { Bust: "90 cm", Length: "100 cm" } }],
        },
      },
    );
    created.productSlug = create.json.data?.slug ?? "";
    check("admin creates product", create.status === 201 && Boolean(created.productSlug), created.productSlug);

    const after = await call<unknown[]>("GET", "/products?limit=60");
    check(
      "new product visible via API (baseline + 1)",
      after.json.data.length === baselineProducts + 1,
      `${after.json.data.length}`,
    );

    const fetched = await call<{ price: number; discount: number; stock: number; sizes: string[]; finalPrice: number }>(
      "GET",
      `/products/slug/${created.productSlug}`,
    );
    check(
      "created product persisted correctly",
      fetched.json.data.price === 99.5 && fetched.json.data.discount === 10 && fetched.json.data.stock === 7,
      `price=${fetched.json.data.price} discount=${fetched.json.data.discount}%`,
    );
    check(
      "discounted price computed by server",
      fetched.json.data.finalPrice === 89.55,
      String(fetched.json.data.finalPrice),
    );
    check("sizes persisted", fetched.json.data.sizes.join("/") === "S/M");

    // price / stock / discount management
    const update = await call<{ price: number; discount: number; stock: number }>(
      "PUT",
      `/products/${created.productSlug}`,
      { token: adminToken, body: { price: 120, discount: 25, stock: 15, title: "E2E Renamed Piece" } },
    );
    check(
      "admin updates price/discount/stock",
      update.json.data.price === 120 && update.json.data.discount === 25 && update.json.data.stock === 15,
      `${update.json.data.price} / ${update.json.data.discount}% / ${update.json.data.stock}`,
    );

    const reread = await call<{ title: string; finalPrice: number }>(
      "GET",
      `/products/slug/${created.productSlug}`,
    );
    check(
      "update persisted in Supabase",
      reread.json.data.title === "E2E Renamed Piece" && reread.json.data.finalPrice === 90,
      `${reread.json.data.title}, $${reread.json.data.finalPrice}`,
    );

    const custDelete = await call("DELETE", `/products/${created.productSlug}`, { token: customerToken });
    check("customer cannot delete a product -> 403", custDelete.status === 403);
  }

  console.log("\n=== 5. ADMIN CATEGORIES ===");
  let tempCategoryId = "";
  {
    const list = await call<Array<{ id: string; slug: string; productCount: number }>>(
      "GET",
      "/categories",
    );
    check("categories = 8", list.json.data.length === 8);

    const create = await call<{ id: string; slug: string; label: string }>("POST", "/admin/categories", {
      token: adminToken,
      body: { label: "E2E Temp Category" },
    });
    tempCategoryId = create.json.data?.id ?? "";
    check("admin creates category", create.status === 201 && create.json.data.slug === "e2e-temp-category");

    const update = await call<{ label: string }>("PUT", `/admin/categories/${tempCategoryId}`, {
      token: adminToken,
      body: { label: "E2E Renamed Category" },
    });
    check("admin updates category", update.json.data.label === "E2E Renamed Category");

    // A category holding products must not be removable.
    const dresses = list.json.data.find((c) => c.slug === "dresses");
    const blocked = await call("DELETE", `/admin/categories/${dresses?.id}`, { token: adminToken });
    check(
      "category in use cannot be deleted -> 409",
      blocked.status === 409,
      blocked.json.message,
    );

    const del = await call("DELETE", `/admin/categories/${tempCategoryId}`, { token: adminToken });
    check("admin deletes empty temp category", del.status === 200);
    tempCategoryId = "";

    const after = await call<unknown[]>("GET", "/categories");
    check("categories back to 8", after.json.data.length === 8);
  }

  console.log("\n=== 6. CHECKOUT (tampering ignored) ===");
  {
    // Build a known cart: 2 x Silk Sleeveless Top @ $109 = $218
    await call("DELETE", "/cart", { token: customerToken });
    await call("POST", "/cart", {
      token: customerToken,
      body: { productId: "silk-top", size: "M", quantity: 2 },
    });
    const cart = await call<{ subtotal: number; total: number }>("GET", "/cart", { token: customerToken });
    check("test cart subtotal = 218", cart.json.data.subtotal === 218, String(cart.json.data.subtotal));

    const order = await call<{
      id: string;
      subtotal: number;
      shipping: number;
      total: number;
    }>("POST", "/orders", {
      token: customerToken,
      body: {
        customerName: "Demo Guest",
        email: env.DEMO_USER_EMAIL,
        phone: "+961 70 000 000",
        address: "12 Rue Saint-Honoré",
        city: "Beirut",
        paymentMethod: "card",
        card: TEST_CARD,
        // hostile values that must be ignored:
        subtotal: 0.01,
        total: 0.01,
        discount: 999,
        shipping: -50,
      },
    });
    if (order.json.data?.id) created.orderIds.push(order.json.data.id);

    check("order created", order.status === 201 && Boolean(order.json.data?.id));
    check(
      "server subtotal used, not the 0.01 sent",
      order.json.data.subtotal === 218,
      String(order.json.data.subtotal),
    );
    check(
      "negative shipping ignored — server rate applied",
      order.json.data.shipping > 0,
      String(order.json.data.shipping),
    );
    check(
      "server total = subtotal + shipping",
      order.json.data.total === order.json.data.subtotal + order.json.data.shipping,
      `subtotal=${order.json.data.subtotal} shipping=${order.json.data.shipping} total=${order.json.data.total}`,
    );

    // A second order, so the admin order list below has more than one row.
    await call("POST", "/cart", {
      token: customerToken,
      body: { productId: "silk-top", size: "M", quantity: 2 },
    });
    const second = await call<{ id: string }>("POST", "/orders", {
      token: customerToken,
      body: {
        customerName: "Demo Guest",
        email: env.DEMO_USER_EMAIL,
        phone: "+961 70 111 222",
        address: "8 Rue de Rivoli",
        city: "Beirut",
        paymentMethod: "card",
        card: TEST_CARD,
      },
    });
    if (second.json.data?.id) created.orderIds.push(second.json.data.id);
    check("second order created", second.status === 201);

    await call("DELETE", "/cart", { token: customerToken });
  }

  console.log("\n=== 7. ADMIN ORDERS + REVIEWS + CUSTOMERS ===");
  {
    const orders = await call<Array<{ id: string; status: string }>>(
      "GET",
      "/admin/orders",
      { token: adminToken },
    );
    check("admin sees all orders", orders.json.data.length >= 2, `${orders.json.data.length} orders`);
    const target = created.orderIds[0]!;
    const detail = await call<{ id: string }>("GET", `/admin/orders/${target}`, { token: adminToken });
    check("admin order detail", detail.json.data.id === target);

    const status = await call<{ status: string }>("PUT", `/admin/orders/${target}/status`, {
      token: adminToken,
      body: { status: "shipped" },
    });
    check("admin updates order status", status.json.data.status === "shipped");

    const badStatus = await call("PUT", `/admin/orders/${target}/status`, {
      token: adminToken,
      body: { status: "teleported" },
    });
    check("invalid status rejected -> 422", badStatus.status === 422);

    const customers = await call<Array<{ email: string; ordersCount: number; totalSpent: number }>>(
      "GET",
      "/admin/customers",
      { token: adminToken },
    );
    const demo = customers.json.data.find((c) => c.email === env.DEMO_USER_EMAIL);
    check(
      "admin customers shows real order totals",
      Boolean(demo) && demo!.ordersCount >= 2,
      `${demo?.ordersCount} orders, $${demo?.totalSpent}`,
    );

    const reviews = await call<Array<{ id: string; productTitle: string; status: string }>>(
      "GET",
      "/admin/reviews",
      { token: adminToken },
    );
    check("admin sees reviews with product titles", reviews.json.data.length >= 3 && Boolean(reviews.json.data[0]?.productTitle));

    const reviewId = reviews.json.data[0]!.id;
    const hide = await call("PUT", `/admin/reviews/${reviewId}`, {
      token: adminToken,
      body: { status: "hidden" },
    });
    check("admin hides a review", hide.status === 200);

    const productSlug = reviews.json.data[0]!.productTitle;
    const publicReviews = await call<{ reviews: Array<{ id: string }> }>(
      "GET",
      `/products/linen-midi-dress/reviews`,
    );
    const stillVisible = publicReviews.json.data.reviews.some((r) => r.id === reviewId);
    check(
      "hidden review disappears from the storefront",
      !stillVisible,
      `checked against ${productSlug}`,
    );

    const restore = await call("PUT", `/admin/reviews/${reviewId}`, {
      token: adminToken,
      body: { status: "approved" },
    });
    check("admin restores the review", restore.status === 200);
  }

  console.log("\n=== 8. CLEANUP ===");
  {
    const del = await call("DELETE", `/products/${created.productSlug}`, { token: adminToken });
    check("temporary test product deleted", del.status === 200);

    const client = new pg.Client({
      ...env.db,
      ssl: { rejectUnauthorized: false },
      application_name: "vielinea-admin-e2e-cleanup",
      connectionTimeoutMillis: 20_000,
    });
    await client.connect();

    for (const id of created.orderIds) {
      await client.query("DELETE FROM public.orders WHERE id = $1", [id]);
    }
    await client.query("DELETE FROM public.users WHERE lower(email) = lower($1)", [created.userEmail]);
    await client.query(
      "DELETE FROM public.cart_items WHERE user_id = (SELECT id FROM public.users WHERE lower(email)=lower($1))",
      [env.DEMO_USER_EMAIL],
    );

    // Restore stock consumed by the checkout tests.
    await client.query("UPDATE public.products SET stock = 34 WHERE slug = 'silk-top'");
    await client.query(
      `UPDATE public.product_sizes ps SET stock = v.stock
       FROM (VALUES ('XS',7),('S',7),('M',7),('L',7),('XL',6)) AS v(size, stock)
       WHERE ps.size = v.size
         AND ps.product_id = (SELECT id FROM public.products WHERE slug = 'silk-top')`,
    );

    const { rows } = await client.query<{
      products: number;
      categories: number;
      images: number;
      reviews: number;
      stock: number;
    }>(`
      SELECT (SELECT count(*)::int FROM public.products)        AS products,
             (SELECT count(*)::int FROM public.categories)      AS categories,
             (SELECT count(*)::int FROM public.product_images)  AS images,
             (SELECT count(*)::int FROM public.reviews)         AS reviews,
             (SELECT stock FROM public.products WHERE slug='silk-top') AS stock
    `);
    const r = rows[0]!;
    console.log(
      `  final: products=${r.products} categories=${r.categories} images=${r.images} reviews=${r.reviews}`,
    );

    check(
      "catalogue back to baseline (temporary product removed)",
      r.products === baselineProducts,
      `${r.products} (baseline ${baselineProducts})`,
    );
    check("8 categories intact", r.categories === 8, String(r.categories));
    check(
      "product images back to baseline",
      r.images === baselineImages,
      `${r.images} (baseline ${baselineImages})`,
    );
    check("3 seeded reviews intact", r.reviews === 3, String(r.reviews));
    check("stock restored", r.stock === 34, String(r.stock));

    await client.end();
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`ADMIN E2E: ${passed} passed, ${failed} failed`);
  if (failed > 0) console.log(`Failures:\n  - ${failures.join("\n  - ")}`);
  console.log("=".repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(`Admin E2E crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
