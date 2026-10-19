/**
 * End-to-end test for Cash on Delivery, against the running server and the
 * real Supabase database.
 *
 * Two payment routes exist and this asserts they stay distinct:
 *
 *   card - settles at checkout. The order opens 'paid' / 'paid', exactly as
 *          every order behaved before COD existed. This is the regression
 *          guard for the pre-existing flow.
 *   cod  - nothing is collected at checkout. The order opens 'pending' /
 *          'pending' and only an admin can settle it afterwards.
 *
 * Data: one temporary QA customer under @vielinea.test. Every order it places
 * is deleted at the end and the stock its checkouts consumed is put back.
 * Seeded products, categories and accounts are never modified.
 */
import pg from "pg";
import { env } from "../src/config/env.js";

const BASE = `http://localhost:${env.PORT}/api`;
/** Card token of the shape the browser produces — no PAN, no CVV. Approved. */
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

function section(title: string): void {
  console.log(`\n${title}`);
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
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

interface ApiOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  shipping: number;
  total: number;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  items: Array<{ productTitle: string; quantity: number; unitPrice: number; totalPrice: number }>;
}

const TEST_PRODUCT = "silk-top";
const TEST_SIZE = "M";

const qaEmail = `cod-e2e-${Date.now()}@vielinea.test`;
const createdOrderIds: string[] = [];
let unitsConsumed = 0;

const delivery = {
  customerName: "COD QA Customer",
  email: qaEmail,
  phone: "+961 70 555 111",
  address: "27 Rue Gouraud, Gemmayzeh",
  city: "Beirut",
  postalCode: "1100",
  country: "Lebanon",
};

async function fillCart(token: string, quantity: number): Promise<void> {
  await call("DELETE", "/cart", { token });
  await call("POST", "/cart", {
    token,
    body: { productId: TEST_PRODUCT, size: TEST_SIZE, quantity },
  });
  unitsConsumed += quantity;
}

async function main(): Promise<void> {
  console.log(`Cash on Delivery — end-to-end\n${"=".repeat(60)}`);

  // -- Accounts -------------------------------------------------------------
  section("0. Setup");
  const reg = await call<{ token: string; user: { id: string } }>("POST", "/auth/register", {
    body: { name: "COD QA Customer", email: qaEmail, password: "codqa12345" },
  });
  check("QA customer registered", reg.status === 201 || reg.status === 200, `status ${reg.status}`);
  const token = reg.json.data?.token ?? "";
  if (!token) throw new Error("could not register the QA customer");

  const adminLogin = await call<{ token: string }>("POST", "/auth/login", {
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.json.data?.token ?? "";
  check("admin signed in", Boolean(adminToken));
  if (!adminToken) throw new Error("could not sign the admin in");

  // -- 1. COD order creation ------------------------------------------------
  section("1. COD order creation");
  await fillCart(token, 2);
  const cartBefore = await call<{ subtotal: number; total: number }>("GET", "/cart", { token });
  const expectedSubtotal = cartBefore.json.data.subtotal;
  const expectedTotal = cartBefore.json.data.total;

  const cod = await call<ApiOrder>("POST", "/orders", {
    token,
    body: {
      ...delivery,
      notes: "Ring the top bell",
      paymentMethod: "cod",
      // Hostile extras — the server must ignore every one of these.
      paymentStatus: "paid",
      status: "delivered",
      subtotal: 0.01,
      shipping: -50,
      total: 0.01,
    },
  });
  if (cod.json.data?.id) createdOrderIds.push(cod.json.data.id);
  const codOrder = cod.json.data;

  check("COD order created", cod.status === 201 && Boolean(codOrder?.id), codOrder?.orderNumber);
  check("payment_method = cod", codOrder?.paymentMethod === "cod", codOrder?.paymentMethod);
  check(
    "payment_status starts pending",
    codOrder?.paymentStatus === "pending",
    codOrder?.paymentStatus,
  );
  check("order status starts pending", codOrder?.status === "pending", codOrder?.status);

  // The card route is the one that settles a payment at checkout. A COD order
  // that comes back unpaid and unsettled is the observable proof that no card
  // settlement ran for it.
  check(
    "no card settlement ran for the COD order",
    codOrder?.paymentStatus === "pending" && codOrder?.status !== "paid",
    `status=${codOrder?.status} payment=${codOrder?.paymentStatus}`,
  );

  // -- 2. The order carries the complete record -----------------------------
  section("2. COD order carries the full record");
  check("customer recorded", codOrder?.customerName === delivery.customerName);
  check("email recorded", codOrder?.email === delivery.email);
  check("phone recorded", codOrder?.phone === delivery.phone);
  check(
    "shipping address recorded",
    codOrder?.address === delivery.address && codOrder?.city === delivery.city,
  );
  check("products recorded", (codOrder?.items?.length ?? 0) === 1, `${codOrder?.items?.length}`);
  check("quantities recorded", codOrder?.items?.[0]?.quantity === 2, `${codOrder?.items?.[0]?.quantity}`);
  check(
    "subtotal is the server's, not the 0.01 sent",
    codOrder?.subtotal === expectedSubtotal,
    `${codOrder?.subtotal} (cart said ${expectedSubtotal})`,
  );
  check("delivery fee is the server's, not the -50 sent", codOrder?.shipping > 0, `${codOrder?.shipping}`);
  check(
    "total recalculated server-side = subtotal + delivery fee",
    codOrder?.total === expectedTotal && codOrder?.total === codOrder?.subtotal + codOrder?.shipping,
    `${codOrder?.total}`,
  );
  const emptied = await call<{ items: unknown[] }>("GET", "/cart", { token });
  check("cart cleared after COD checkout", emptied.json.data.items.length === 0);

  // -- 2b. The field set the checkout form actually submits ------------------
  // The customer-facing form collects name, email, phone, address and
  // city/area only — no postal code, no country. Both remain optional on the
  // API and nullable in the database, so an order built from exactly those
  // fields must still be created and must still carry its delivery address.
  section("2b. Checkout without postal code or country");
  await fillCart(token, 1);
  const trimmed = await call<ApiOrder & { postalCode: string | null; country: string | null }>(
    "POST",
    "/orders",
    {
      token,
      body: {
        customerName: delivery.customerName,
        email: delivery.email,
        phone: delivery.phone,
        address: delivery.address,
        city: delivery.city,
        paymentMethod: "cod",
      },
    },
  );
  if (trimmed.json.data?.id) createdOrderIds.push(trimmed.json.data.id);
  check("order created without postal code or country", trimmed.status === 201, `status ${trimmed.status}`);
  check("postal code stored as null", trimmed.json.data?.postalCode === null, `${trimmed.json.data?.postalCode}`);
  check("country stored as null", trimmed.json.data?.country === null, `${trimmed.json.data?.country}`);
  check("address still recorded", trimmed.json.data?.address === delivery.address);
  check("city / area still recorded", trimmed.json.data?.city === delivery.city, trimmed.json.data?.city);
  check("COD behaviour unchanged by the trimmed form", trimmed.json.data?.paymentMethod === "cod" && trimmed.json.data?.paymentStatus === "pending" && trimmed.json.data?.status === "pending");

  // -- 3. Card route unchanged ---------------------------------------------
  section("3. Visa / Card route unchanged");
  await fillCart(token, 1);
  const card = await call<ApiOrder>("POST", "/orders", {
    token,
    body: { ...delivery, paymentMethod: "card", card: TEST_CARD },
  });
  if (card.json.data?.id) createdOrderIds.push(card.json.data.id);
  check("card order created", card.status === 201, card.json.data?.orderNumber);
  check("payment_method = card", card.json.data?.paymentMethod === "card");
  check(
    "card order settles immediately — payment_status paid",
    card.json.data?.paymentStatus === "paid",
  );
  check("card order status paid, as before COD existed", card.json.data?.status === "paid");

  // A client that sends no payment method at all still lands on the card
  // route, and the card route now needs a token like any other card payment.
  await fillCart(token, 1);
  const legacy = await call<ApiOrder>("POST", "/orders", {
    token,
    body: { ...delivery, card: TEST_CARD },
  });
  if (legacy.json.data?.id) createdOrderIds.push(legacy.json.data.id);
  check("order with no paymentMethod defaults to card", legacy.json.data?.paymentMethod === "card");
  check(
    "legacy default still settles as paid",
    legacy.json.data?.paymentStatus === "paid" && legacy.json.data?.status === "paid",
  );

  // -- 4. Validation --------------------------------------------------------
  section("4. Payment method validation");
  await fillCart(token, 1);
  const bogus = await call("POST", "/orders", {
    token,
    body: { ...delivery, paymentMethod: "bitcoin" },
  });
  check("unknown payment method rejected -> 422", bogus.status === 422, `status ${bogus.status}`);

  const emptyMethod = await call("POST", "/orders", {
    token,
    body: { ...delivery, paymentMethod: "" },
  });
  check("empty payment method rejected -> 422", emptyMethod.status === 422, `status ${emptyMethod.status}`);

  const anon = await call("POST", "/orders", { body: { ...delivery, paymentMethod: "cod" } });
  check("COD checkout still requires auth -> 401", anon.status === 401, `status ${anon.status}`);

  await call("DELETE", "/cart", { token });
  unitsConsumed -= 1; // that cart was never converted into an order

  // -- 5. Admin sees and settles COD ---------------------------------------
  section("5. Admin: sees COD orders and can settle them");
  const codId = createdOrderIds[0]!;
  const adminList = await call<ApiOrder[]>("GET", "/admin/orders?limit=200", { token: adminToken });
  const seen = adminList.json.data.find((o) => o.id === codId);
  check("admin sees the COD order in the list", Boolean(seen), seen?.orderNumber);
  check("admin list shows payment method", seen?.paymentMethod === "cod", seen?.paymentMethod);
  check("admin list shows payment status", seen?.paymentStatus === "pending", seen?.paymentStatus);
  check("admin list shows order status", seen?.status === "pending", seen?.status);

  const custAttempt = await call("PUT", `/admin/orders/${codId}/payment-status`, {
    token,
    body: { paymentStatus: "paid" },
  });
  check("customer cannot settle a payment -> 403", custAttempt.status === 403, `status ${custAttempt.status}`);

  const anonAttempt = await call("PUT", `/admin/orders/${codId}/payment-status`, {
    body: { paymentStatus: "paid" },
  });
  check("anonymous cannot settle a payment -> 401", anonAttempt.status === 401, `status ${anonAttempt.status}`);

  const badStatus = await call("PUT", `/admin/orders/${codId}/payment-status`, {
    token: adminToken,
    body: { paymentStatus: "refunded" },
  });
  check("invalid payment status rejected -> 422", badStatus.status === 422, `status ${badStatus.status}`);

  const settled = await call<ApiOrder>("PUT", `/admin/orders/${codId}/payment-status`, {
    token: adminToken,
    body: { paymentStatus: "paid" },
  });
  check(
    "admin marks the COD order paid",
    settled.status === 200 && settled.json.data.paymentStatus === "paid",
  );
  check(
    "settling payment does not move the order status",
    settled.json.data.status === "pending",
    settled.json.data.status,
  );

  // -- 6. Customer sees the payment state ----------------------------------
  section("6. Customer sees the COD payment state");
  const mine = await call<ApiOrder>("GET", `/orders/${codId}`, { token });
  check("customer reads their COD order", mine.status === 200);
  check("customer sees payment method", mine.json.data.paymentMethod === "cod");
  check("customer sees the admin's update — now paid", mine.json.data.paymentStatus === "paid");
  check("customer sees order status", mine.json.data.status === "pending");

  const list = await call<ApiOrder[]>("GET", "/orders", { token });
  const row = list.json.data.find((o) => o.id === codId);
  check(
    "payment fields present in the customer's order list",
    row?.paymentMethod === "cod" && row?.paymentStatus === "paid",
  );

  // -- 7. Cleanup -----------------------------------------------------------
  section("7. Cleanup — QA rows only");
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-e2e-cod",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  for (const id of createdOrderIds) {
    await client.query("DELETE FROM public.orders WHERE id = $1", [id]);
  }
  await client.query("DELETE FROM public.users WHERE lower(email) = lower($1)", [qaEmail]);

  // Put back exactly what these checkouts consumed.
  await client.query("UPDATE public.products SET stock = stock + $2 WHERE slug = $1", [
    TEST_PRODUCT,
    unitsConsumed,
  ]);
  await client.query(
    `UPDATE public.product_sizes ps SET stock = ps.stock + $3
       FROM public.products p
      WHERE p.slug = $1 AND ps.product_id = p.id AND ps.size = $2`,
    [TEST_PRODUCT, TEST_SIZE, unitsConsumed],
  );

  const left = await client.query<{ orders: number; users: number }>(
    `SELECT (SELECT count(*)::int FROM public.orders o
               JOIN public.users u ON u.id = o.user_id
              WHERE lower(u.email) = lower($1)) AS orders,
            (SELECT count(*)::int FROM public.users
              WHERE lower(email) = lower($1))   AS users`,
    [qaEmail],
  );
  check("no QA orders left behind", left.rows[0]?.orders === 0, `${left.rows[0]?.orders}`);
  check("QA account removed", left.rows[0]?.users === 0, `${left.rows[0]?.users}`);
  await client.end();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`COD E2E: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("=".repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
