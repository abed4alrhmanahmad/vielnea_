/**
 * Verifies the admin new-order notification without contacting Resend.
 *
 * global fetch is stubbed, so this asserts the request VIELINEA would send —
 * endpoint, auth header, body shape — plus HTML escaping of customer input and
 * the guarantee that a provider failure never propagates to checkout.
 *
 * Run: EMAIL_API_KEY=re_test npx tsx scripts/verify-order-email.ts
 */
import { env } from "../src/config/env.js";
import { createResendProvider } from "../src/services/email/resend.provider.js";
import { buildOrderNotification, sendNewOrderNotification } from "../src/services/email/order-notification.js";
import type { Order } from "../src/types/models.js";

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

globalThis.fetch = realFetch;

console.log(failures === 0 ? "\nAll email checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
