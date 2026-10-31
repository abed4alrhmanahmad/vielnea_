/**
 * Verifies the order emails — the admin notification and the customer
 * confirmation — without contacting Resend.
 *
 * global fetch is stubbed, so this asserts the request VIELINEA would send —
 * endpoint, auth header, body shape, idempotency key — plus HTML escaping of
 * customer input, retries, the independence of the two emails, masked logs, and
 * the guarantee that a provider failure never propagates to checkout.
 *
 * Run: EMAIL_API_KEY=re_test npx tsx scripts/verify-order-email.ts
 */
import { env } from "../src/config/env.js";
import { createResendProvider } from "../src/services/email/resend.provider.js";
import { buildOrderNotification, sendNewOrderNotification } from "../src/services/email/order-notification.js";
import {
  buildOrderConfirmation,
  customerConfirmationsEnabled,
  sendOrderConfirmation,
} from "../src/services/email/order-confirmation.js";
import { deliveryTiming, orderEmailKey } from "../src/services/email/deliver.js";
import type { Order } from "../src/types/models.js";

// Retries pause for seconds in production; a few milliseconds is enough here.
deliveryTiming.retryDelaysMs = [5, 5];

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  // eslint-disable-next-line no-console
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const order: Order = {
  id: "9f1c1e6a-0000-4000-8000-000000000001",
  orderNumber: "VLN-20260924-0484",
  userId: "4e8efebc-fab8-4699-b0e1-728e08e03be2",
  status: "pending",
  subtotal: 189,
  discount: 0,
  shipping: 15,
  total: 204,
  paymentMethod: "cod",
  paymentStatus: "pending",
  paymentReference: null,
  cardBrand: null,
  cardLast4: null,
  // Deliberately hostile: this must not survive as live markup.
  customerName: 'Amira <script>alert("xss")</script> Haddad',
  email: "amira@example.com",
  phone: "+9611234567",
  address: "12 Rue Gouraud & Co",
  city: "Beirut",
  postalCode: "1100",
  country: "Lebanon",
  notes: "Ring the <b>upper</b> bell",
  items: [
    {
      id: "item-1",
      productId: "cf379644-72d8-4d0f-9b2c-3d15e6427627",
      productTitle: "Linen Midi Wrap Dress",
      productSlug: "linen-midi-dress",
      imageUrl: null,
      size: "M",
      quantity: 1,
      unitPrice: 189,
      totalPrice: 189,
    },
  ],
  createdAt: new Date("2026-09-24T05:30:00Z").toISOString(),
};

console.log("\n1. Message content");
const built = buildOrderNotification(order);
check("subject names the order", built.subject === "New VIELINEA Order VLN-20260924-0484", built.subject);
check("html carries the order number", built.html.includes("VLN-20260924-0484"));
check("html carries the customer name", built.html.includes("Amira"));
check("html carries the order id", built.html.includes(order.id));
check("script tag is escaped, not live", !built.html.includes("<script>") && built.html.includes("&lt;script&gt;"));
check("ampersand in address escaped", built.html.includes("Gouraud &amp; Co"));
check("notes markup escaped", built.html.includes("&lt;b&gt;upper&lt;/b&gt;"));
check("text part names order + customer", built.text.includes("VLN-20260924-0484") && built.text.includes("Amira"));
check("total rendered as money", built.html.includes("$204.00"));

console.log("\n2. Resend request shape (fetch stubbed)");
const realFetch = globalThis.fetch;
let captured: { url: string; init: RequestInit } | null = null;

globalThis.fetch = (async (url: string, init: RequestInit) => {
  captured = { url: String(url), init };
  return new Response(JSON.stringify({ id: "mock-id" }), { status: 200 });
}) as unknown as typeof fetch;

await createResendProvider("re_test_key").send({
  // Read from configuration, never a literal — this is the assertion that the
  // Resend request is addressed to whatever ADMIN_EMAIL currently holds.
  to: env.orderNotificationEmail,
  from: "VIELINEA <onboarding@resend.dev>",
  replyTo: order.email,
  subject: built.subject,
  html: built.html,
  text: built.text,
});

const req = captured as unknown as { url: string; init: RequestInit } | null;
check("posts to Resend", req?.url === "https://api.resend.com/emails" && req?.init.method === "POST");
const headers = (req?.init.headers ?? {}) as Record<string, string>;
check("bearer auth header set", headers["Authorization"] === "Bearer re_test_key");
check("json content type", headers["Content-Type"] === "application/json");
const body = JSON.parse(String(req?.init.body ?? "{}"));
check(
  "to is the configured admin recipient",
  Array.isArray(body.to) && body.to[0] === env.orderNotificationEmail,
  `got ${JSON.stringify(body.to)}`,
);
check(
  "recipient resolves from ORDER_NOTIFICATION_EMAIL, else ADMIN_EMAIL",
  env.ORDER_NOTIFICATION_EMAIL === undefined
    ? env.orderNotificationEmail === env.ADMIN_EMAIL
    : env.orderNotificationEmail === env.ORDER_NOTIFICATION_EMAIL,
  `ADMIN_EMAIL=${env.ADMIN_EMAIL} override=${String(env.ORDER_NOTIFICATION_EMAIL)}`,
);
check("from is the configured sender", body.from === "VIELINEA <onboarding@resend.dev>");
check("reply_to is the customer", body.reply_to === "amira@example.com");
check("subject + html + text all present", Boolean(body.subject && body.html && body.text));

console.log("\n3. A mail failure must not break checkout");
globalThis.fetch = (async () =>
  new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;

let threw = false;
try {
  await sendNewOrderNotification(order);
} catch {
  threw = true;
}
check("sendNewOrderNotification swallows a 401", !threw);

globalThis.fetch = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

threw = false;
try {
  await sendNewOrderNotification(order);
} catch {
  threw = true;
}
check("sendNewOrderNotification swallows a network error", !threw);

// --- Helpers for the sections below -----------------------------------------
type Call = { to: string; key: string | undefined; body: Record<string, unknown> };

/** Replaces fetch with `respond`, recording every request Resend would get. */
function stubFetch(respond: (call: Call, n: number) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call = { to: (body.to as string[])[0] ?? "", key: headers["Idempotency-Key"], body };
    calls.push(call);
    return respond(call, calls.length);
  }) as unknown as typeof fetch;
  return calls;
}
const ok = (id = "mock-id") => new Response(JSON.stringify({ id }), { status: 200 });

/** Runs `fn` with console output captured instead of printed. */
async function captureLogs(fn: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const saved = { log: console.log, warn: console.warn, error: console.error };
  const keep = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  Object.assign(console, { log: keep, warn: keep, error: keep });
  try {
    await fn();
  } finally {
    Object.assign(console, saved);
  }
  return lines.join("\n");
}

// The customer confirmation needs a sender that can reach customers; these
// sections use a verified-domain sender and put the configured one back after.
const configuredFrom = env.EMAIL_FROM;
const mutableEnv = env as unknown as { EMAIL_FROM: string };
mutableEnv.EMAIL_FROM = "VIELINEA <orders@vielinea.com>";

console.log("\n4. Customer confirmation content");
const conf = buildOrderConfirmation(order);
check("subject names the order", conf.subject === "Your VIELINEA order VLN-20260924-0484", conf.subject);
check("html greets the customer", conf.html.includes("Hi Amira"));
check("script tag in name is escaped", !conf.html.includes("<script>") && conf.html.includes("&lt;script&gt;"));
check("ampersand in address escaped", conf.html.includes("Gouraud &amp; Co"));
check("internal order id is not shown to the customer", !conf.html.includes(order.id) && !conf.text.includes(order.id));
check("cash on delivery explained with the total", conf.html.includes("Cash on delivery") && conf.html.includes("$204.00"));
check("no discount row when there is no discount", !conf.html.includes("Discount"));
const cardConf = buildOrderConfirmation({
  ...order,
  paymentMethod: "card",
  paymentStatus: "paid",
  cardBrand: "Visa",
  cardLast4: "4242",
});
check("card payment shows brand and last 4 only", cardConf.text.includes("Paid by card (Visa ···· 4242)."));
check("text part names the order", conf.text.includes("VLN-20260924-0484"));

console.log("\n5. Request shape and idempotency keys");
let calls = stubFetch(() => ok());
await sendOrderConfirmation(order);
await sendNewOrderNotification(order);
await sendOrderConfirmation(order);
check("customer confirmation is addressed to the customer", calls[0]?.to === "amira@example.com");
check("customer confirmation has no reply-to", !("reply_to" in (calls[0]?.body ?? {})));
check("idempotency key sent on the customer email", calls[0]?.key === orderEmailKey("customer confirmation", order));
check("admin email has its own, different key", calls[1]?.key === orderEmailKey("order notification", order) && calls[1]?.key !== calls[0]?.key);
check("the key is stable for a repeat of the same email", calls[2]?.key === calls[0]?.key);

console.log("\n6. Retries: transient failures only, same key every attempt");
calls = stubFetch((_c, n) => (n === 1 ? new Response("upstream", { status: 500 }) : ok()));
await captureLogs(() => sendNewOrderNotification(order));
check("a 500 is retried, then accepted", calls.length === 2);
check("the retry reuses the idempotency key", calls[0]?.key === calls[1]?.key);
calls = stubFetch((_c, n) => (n === 1 ? new Response("slow down", { status: 429 }) : ok()));
await captureLogs(() => sendOrderConfirmation(order));
check("a 429 is retried, then accepted", calls.length === 2);
calls = stubFetch(() => new Response("domain not verified", { status: 403 }));
await captureLogs(() => sendNewOrderNotification(order));
check("a 403 is not retried", calls.length === 1);
calls = stubFetch(() => {
  throw new Error("ECONNRESET");
});
threw = false;
await captureLogs(() => sendOrderConfirmation(order)).catch(() => (threw = true));
check("a network failure is tried 3 times, then given up", calls.length === 3 && !threw);

console.log("\n7. Admin and customer emails fail independently");
calls = stubFetch((call) => (call.to === "amira@example.com" ? ok("cust-id") : new Response("bad key", { status: 401 })));
let log = await captureLogs(() => Promise.all([sendNewOrderNotification(order), sendOrderConfirmation(order)]));
check("customer email still accepted when the admin email fails", log.includes("customer confirmation accepted") && log.includes("order notification FAILED"));
calls = stubFetch((call) => (call.to === "amira@example.com" ? new Response("rejected", { status: 422 }) : ok("admin-id")));
log = await captureLogs(() => Promise.all([sendNewOrderNotification(order), sendOrderConfirmation(order)]));
check("admin email still accepted when the customer email fails", log.includes("order notification accepted") && log.includes("customer confirmation FAILED"));

console.log("\n8. Logs never carry a full customer address");
calls = stubFetch(() => new Response('{"message":"Invalid `to`: amira@example.com"}', { status: 422 }));
log = await captureLogs(() => sendOrderConfirmation(order));
check("rejection logged with the address masked", log.includes("a***@example.com") && !log.includes("amira@example.com"));
calls = stubFetch(() => ok());
log = await captureLogs(() => sendOrderConfirmation(order));
check("acceptance logged with the address masked", log.includes("a***@example.com") && !log.includes("amira@example.com"));

console.log("\n9. Resend's test sender cannot reach customers, so confirmations are skipped");
mutableEnv.EMAIL_FROM = "VIELINEA <onboarding@resend.dev>";
calls = stubFetch(() => ok());
log = await captureLogs(() => Promise.all([sendNewOrderNotification(order), sendOrderConfirmation(order)]));
check("confirmations report disabled", !customerConfirmationsEnabled());
check("no request is made for the customer", calls.length === 1 && calls[0]?.to !== "amira@example.com");
check("the skip is logged with the reason", log.includes("customer confirmation skipped") && log.includes("test sender"));

mutableEnv.EMAIL_FROM = configuredFrom;
globalThis.fetch = realFetch;

console.log(failures === 0 ? "\nAll email checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
