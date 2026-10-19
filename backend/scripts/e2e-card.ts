/**
 * End-to-end test for the Visa / Card payment route.
 *
 * VIELINEA has no payment processor account. Card payment is therefore an
 * interface (src/services/payment/) with the provider chosen by
 * PAYMENT_PROVIDER. These tests run against the `sandbox` adapter, which moves
 * no money and is refused in production — what they prove is that the checkout
 * path around the provider is correct:
 *
 *   - the provider is consulted before any row is written
 *   - a decline creates no order, moves no stock and keeps the cart
 *   - only a successful authorization produces a paid order
 *   - the raw card number and CVV never reach the API or the database
 *   - Cash on Delivery never touches the provider at all
 *
 * Data: one temporary QA customer under @vielinea.test. Everything it creates
 * is removed at the end and the stock its checkouts consumed is put back.
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
  paymentReference: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  subtotal: number;
  shipping: number;
  total: number;
  items: Array<{ quantity: number }>;
}

/**
 * Tokens of the shape the browser produces. The card number and CVV are
 * absent by design — they never leave the browser, and the API has no field
 * for them. The sandbox provider decides the outcome from `last4`.
 */
const APPROVED = {
  token: "cardtok_e2e_ok",
  brand: "visa",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2031,
};
const DECLINED = { ...APPROVED, token: "cardtok_e2e_declined", last4: "0002" };
const PROVIDER_ERROR = { ...APPROVED, token: "cardtok_e2e_error", last4: "0119" };

const TEST_PRODUCT = "silk-top";
const TEST_SIZE = "M";

const qaEmail = `card-e2e-${Date.now()}@vielinea.test`;
const createdOrderIds: string[] = [];
let unitsConsumed = 0;

const delivery = {
  customerName: "Card QA Customer",
  email: qaEmail,
  phone: "+961 70 777 222",
  address: "5 Rue Monot",
  city: "Beirut",
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
  console.log(`Visa / Card payment — end-to-end\n${"=".repeat(60)}`);
  console.log(`  provider under test: ${env.PAYMENT_PROVIDER}`);

  section("0. Setup");
  const reg = await call<{ token: string }>("POST", "/auth/register", {
    body: { name: "Card QA Customer", email: qaEmail, password: "cardqa12345" },
  });
  check("QA customer registered", reg.status === 201 || reg.status === 200, `status ${reg.status}`);
  const token = reg.json.data?.token ?? "";
  if (!token) throw new Error("could not register the QA customer");

  const adminLogin = await call<{ token: string }>("POST", "/auth/login", {
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.json.data?.token ?? "";
  check("admin signed in", Boolean(adminToken));

  // -- 1. Successful card payment -------------------------------------------
  section("1. Successful card payment");
  await fillCart(token, 2);
  const cart = await call<{ subtotal: number; total: number }>("GET", "/cart", { token });
  const expectedSubtotal = cart.json.data.subtotal;
  const expectedTotal = cart.json.data.total;

  const ok = await call<ApiOrder>("POST", "/orders", {
    token,
    body: {
      ...delivery,
      paymentMethod: "card",
      card: APPROVED,
      idempotencyKey: `e2e-card-${Date.now()}`,
      // Hostile extras the server must ignore.
      paymentStatus: "paid",
      status: "delivered",
      subtotal: 0.01,
      shipping: -50,
      total: 0.01,
    },
  });
  if (ok.json.data?.id) createdOrderIds.push(ok.json.data.id);
  const order = ok.json.data;

  check("card order created", ok.status === 201 && Boolean(order?.id), order?.orderNumber);
  check("payment_method = card", order?.paymentMethod === "card", order?.paymentMethod);
  check("payment_status = paid after authorization", order?.paymentStatus === "paid", order?.paymentStatus);
  check("order reaches a settled status", order?.status === "paid", order?.status);
  check("provider reference stored", Boolean(order?.paymentReference), order?.paymentReference ?? "none");
  check("card brand stored", order?.cardBrand === "visa", order?.cardBrand ?? "none");
  check("card last4 stored", order?.cardLast4 === "4242", order?.cardLast4 ?? "none");

  section("2. Totals recalculated server-side, not taken from the client");
  check(
    "subtotal is the server's, not the 0.01 sent",
    order?.subtotal === expectedSubtotal,
    `${order?.subtotal} (cart said ${expectedSubtotal})`,
  );
  check("delivery fee is the server's, not the -50 sent", order?.shipping > 0, `${order?.shipping}`);
  check(
    "total = subtotal + delivery fee",
    order?.total === expectedTotal && order?.total === order?.subtotal + order?.shipping,
    `${order?.total}`,
  );
  check("quantities from the database cart", order?.items?.[0]?.quantity === 2);

  // -- 3. Declined payment ---------------------------------------------------
  section("3. Declined payment creates no order");
  await fillCart(token, 1);
  const beforeStock = await call<{ stock: number }>("GET", `/products/slug/${TEST_PRODUCT}`);
  const ordersBefore = await call<ApiOrder[]>("GET", "/orders", { token });

  const declined = await call<ApiOrder>("POST", "/orders", {
    token,
    body: { ...delivery, paymentMethod: "card", card: DECLINED },
  });
  check("declined card rejected -> 402", declined.status === 402, `status ${declined.status}`);
  check(
    "customer sees a clean decline message",
    /declined/i.test(declined.json.message ?? ""),
    declined.json.message,
  );

  const ordersAfter = await call<ApiOrder[]>("GET", "/orders", { token });
  check(
    "no order was created for the declined payment",
    ordersAfter.json.data.length === ordersBefore.json.data.length,
    `${ordersBefore.json.data.length} -> ${ordersAfter.json.data.length}`,
  );
  const afterStock = await call<{ stock: number }>("GET", `/products/slug/${TEST_PRODUCT}`);
  check(
    "declined payment moved no stock",
    afterStock.json.data.stock === beforeStock.json.data.stock,
    `${beforeStock.json.data.stock} -> ${afterStock.json.data.stock}`,
  );
  const cartKept = await call<{ items: unknown[] }>("GET", "/cart", { token });
  check("the customer keeps their bag after a decline", cartKept.json.data.items.length === 1);

  // A provider outage is not the customer's fault and must not read as one.
  const errored = await call("POST", "/orders", {
    token,
    body: { ...delivery, paymentMethod: "card", card: PROVIDER_ERROR },
  });
  check("provider error surfaces as 503, not a decline", errored.status === 503, `status ${errored.status}`);

  // -- 4. Card payment cannot bypass validation ------------------------------
  section("4. Card payment does not bypass existing validation");
  const noToken = await call("POST", "/orders", {
    token,
    body: { ...delivery, paymentMethod: "card" },
  });
  check("card without a token rejected -> 400", noToken.status === 400, `status ${noToken.status}`);

  const rawPan = await call("POST", "/orders", {
    token,
    body: {
      ...delivery,
      paymentMethod: "card",
      // A client trying to push a raw card number at the API must be refused
      // outright, not have the field quietly dropped.
      card: { ...APPROVED, number: "4242424242424242", cvc: "123" },
    },
  });
  check("raw card number in the body rejected -> 422", rawPan.status === 422, `status ${rawPan.status}`);

  const badLast4 = await call("POST", "/orders", {
    token,
    body: { ...delivery, paymentMethod: "card", card: { ...APPROVED, last4: "4242424242424242" } },
  });
  check("a full PAN in the last4 field rejected -> 422", badLast4.status === 422, `status ${badLast4.status}`);

  const anon = await call("POST", "/orders", {
    body: { ...delivery, paymentMethod: "card", card: APPROVED },
  });
  check("card checkout still requires auth -> 401", anon.status === 401, `status ${anon.status}`);

  await call("DELETE", "/cart", { token });
  unitsConsumed -= 1; // that cart never became an order

  // -- 5. Idempotency --------------------------------------------------------
  section("5. Double submission does not charge twice");
  await fillCart(token, 1);
  const key = `e2e-idem-${Date.now()}`;
  const body = { ...delivery, paymentMethod: "card", card: APPROVED, idempotencyKey: key };
  const firstClick = await call<ApiOrder>("POST", "/orders", { token, body });
  if (firstClick.json.data?.id) createdOrderIds.push(firstClick.json.data.id);
  check("first click creates the order", firstClick.status === 201);

  // The bag is empty now, so a repeated click cannot become a second paid
  // order — the cart check refuses it before the provider is ever reached.
  const secondClick = await call<ApiOrder>("POST", "/orders", { token, body });
  check(
    "second click does not create a second paid order",
    secondClick.status !== 201,
    `status ${secondClick.status}`,
  );

  // -- 6. COD never reaches the provider ------------------------------------
  section("6. Cash on Delivery is untouched by the card route");
  await fillCart(token, 1);
  const cod = await call<ApiOrder>("POST", "/orders", {
    token,
    // A card token sent alongside COD must be ignored, never charged.
    body: { ...delivery, paymentMethod: "cod", card: APPROVED },
  });
  if (cod.json.data?.id) createdOrderIds.push(cod.json.data.id);
  check("COD order created", cod.status === 201, cod.json.data?.orderNumber);
  check("payment_method stays cod", cod.json.data?.paymentMethod === "cod");
  check("COD is not settled by a card token", cod.json.data?.paymentStatus === "pending");
  check("COD order status stays pending", cod.json.data?.status === "pending");
  check(
    "no provider reference on a COD order — the gateway was never called",
    cod.json.data?.paymentReference === null,
    cod.json.data?.paymentReference ?? "null",
  );
  check("no card metadata on a COD order", cod.json.data?.cardLast4 === null && cod.json.data?.cardBrand === null);

  // -- 7. Nothing sensitive is stored ---------------------------------------
  section("7. No raw card data anywhere in the database");
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-e2e-card",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  const cols = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders'`,
  );
  const names = cols.rows.map((r) => r.column_name);
  check(
    "orders table has no card-number column",
    !names.some((n) => /card_number|pan|card_no/i.test(n)),
    names.filter((n) => n.includes("card")).join(", "),
  );
  check("orders table has no CVV column", !names.some((n) => /cvv|cvc|security_code/i.test(n)));

  const paidOrder = createdOrderIds[0]!;
  const stored = await client.query<Record<string, unknown>>(
    "SELECT * FROM public.orders WHERE id = $1",
    [paidOrder],
  );
  const row = stored.rows[0] ?? {};

  // Scan every stored value for a run of digits long enough to be a card
  // number. `email` is excluded because the QA address carries a Date.now()
  // timestamp; it is customer contact data, never payment data.
  const suspicious = Object.entries(row)
    .filter(([column]) => column !== "email")
    .map(([column, value]) => [column, String(value ?? "")] as const)
    .filter(([, text]) => /\d{13,19}/.test(text.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "")));

  check(
    "no card-number-length digit run in any stored column",
    suspicious.length === 0,
    suspicious.map(([c]) => c).join(", ") || `scanned ${Object.keys(row).length} columns`,
  );
  check("only the last four digits are retained", row["card_last4"] === "4242");

  // -- 8. Admin and customer see the safe metadata --------------------------
  section("8. Admin and customer see safe payment metadata only");
  const adminView = await call<ApiOrder>("GET", `/admin/orders/${paidOrder}`, { token: adminToken });
  check("admin sees the card order", adminView.status === 200);
  check("admin sees payment method card", adminView.json.data.paymentMethod === "card");
  check("admin sees payment status paid", adminView.json.data.paymentStatus === "paid");
  check("admin sees only the last four digits", adminView.json.data.cardLast4 === "4242");
  check("admin sees the provider reference", Boolean(adminView.json.data.paymentReference));

  const customerView = await call<ApiOrder>("GET", `/orders/${paidOrder}`, { token });
  check("customer sees payment method card", customerView.json.data.paymentMethod === "card");
  check("customer sees payment status paid", customerView.json.data.paymentStatus === "paid");
  check("customer sees only the last four digits", customerView.json.data.cardLast4 === "4242");

  // -- 9. Cleanup ------------------------------------------------------------
  section("9. Cleanup — QA rows only");
  for (const id of createdOrderIds) {
    await client.query("DELETE FROM public.orders WHERE id = $1", [id]);
  }
  await client.query("DELETE FROM public.users WHERE lower(email) = lower($1)", [qaEmail]);
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
  console.log(`CARD E2E: ${passed} passed, ${failed} failed`);
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
