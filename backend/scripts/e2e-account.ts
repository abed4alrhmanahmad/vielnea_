/**
 * End-to-end test of the customer account experience, against the running
 * server and the real Supabase database.
 *
 * Covers the whole signed-in surface the storefront's /account area depends on:
 * registration, session, orders and order detail, a status change made by an
 * admin becoming visible to the customer, wishlist, live chat with an admin
 * reply, profile and password edits, and the authorisation boundary between
 * two different customers.
 *
 * Data: two temporary QA customers are registered under @vielinea.test and
 * everything they create is deleted at the end, including the chat threads that
 * would otherwise survive the user row (chat_threads.user_id is SET NULL, not
 * CASCADE). Product stock consumed by the test checkout is put back. Seeded
 * VIELINEA products, categories, CMS content, orders and accounts are never
 * modified or deleted.
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

interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
}
interface AuthResult {
  user: ApiUser;
  token: string;
}
interface ApiProduct {
  id: string;
  slug: string;
  title: string;
  stock: number;
  sizes: string[];
}
interface OrderItem {
  id: string;
  productTitle: string;
  productSlug: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
interface ApiOrder {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  customerName: string;
  createdAt: string;
  items: OrderItem[];
}
interface ChatConversation {
  id: string;
  status: string;
  unreadCount: number;
}
interface ChatMessage {
  id: string;
  senderRole: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const qa = {
  email: `qa_customer_2026_${stamp}@vielinea.test`,
  name: "QA Customer 2026",
  password: "qa-password-2026",
};
const qaOther = {
  email: `qa_customer_2026_${stamp}b@vielinea.test`,
  name: "QA Customer 2026 B",
  password: "qa-password-2026",
};

async function main(): Promise<void> {
  console.log(`Customer account E2E against ${BASE}`);
  console.log(`QA accounts: ${qa.email}, ${qaOther.email}`);

  const health = await call<{ status: string }>("GET", "/health");
  if (health.status !== 200) {
    console.error("\nThe API is not running. Start it with `npm run dev` first.");
    process.exit(1);
  }

  const purchased: Array<{ slug: string; size: string; quantity: number }> = [];

  // -------------------------------------------------------------------------
  section("1. Registration and session");
  // -------------------------------------------------------------------------
  const registered = await call<AuthResult>("POST", "/auth/register", { body: qa });
  check("register creates a customer", registered.status === 201, `status ${registered.status}`);
  check("new account has the customer role", registered.json.data?.user?.role === "customer");
  const token = registered.json.data?.token ?? "";
  check("registration returns a token", token.length > 0);

  const me = await call<{ user: ApiUser }>("GET", "/auth/me", { token });
  check("GET /auth/me returns the caller", me.json.data?.user?.email === qa.email);

  const anonMe = await call("GET", "/auth/me");
  check("GET /auth/me without a token is 401", anonMe.status === 401, `status ${anonMe.status}`);

  const second = await call<AuthResult>("POST", "/auth/register", { body: qaOther });
  const otherToken = second.json.data?.token ?? "";
  check("second QA customer registered", second.status === 201);

  // -------------------------------------------------------------------------
  section("2. Protected endpoints reject anonymous callers");
  // -------------------------------------------------------------------------
  for (const path of ["/orders", "/wishlist", "/cart", "/chat/conversations", "/chat/unread"]) {
    const anon = await call("GET", path);
    check(`GET ${path} without a token is 401`, anon.status === 401, `status ${anon.status}`);
  }

  // -------------------------------------------------------------------------
  section("3. Wishlist");
  // -------------------------------------------------------------------------
  const products = await call<ApiProduct[]>("GET", "/products?limit=5");
  const first = products.json.data?.[0];
  const secondProduct = products.json.data?.[1];
  check("catalogue is readable", Boolean(first), first?.title ?? "");
  if (!first || !secondProduct) throw new Error("The catalogue has fewer than two products");

  const emptyWishlist = await call<unknown[]>("GET", "/wishlist", { token });
  check("a new account starts with an empty wishlist", emptyWishlist.json.data?.length === 0);

  await call("POST", "/wishlist/toggle", { token, body: { productId: first.slug } });
  await call("POST", "/wishlist/toggle", { token, body: { productId: secondProduct.slug } });
  const wishlist = await call<Array<{ product: ApiProduct }>>("GET", "/wishlist", { token });
  check("wishlist holds both saved pieces", wishlist.json.data?.length === 2);

  const moved = await call("POST", "/wishlist/move-to-cart", {
    token,
    body: { productId: secondProduct.slug, quantity: 1 },
  });
  check("move to cart succeeds", moved.status === 200, `status ${moved.status}`);
  const afterMove = await call<unknown[]>("GET", "/wishlist", { token });
  check("moved piece left the wishlist", afterMove.json.data?.length === 1);

  const otherWishlist = await call<unknown[]>("GET", "/wishlist", { token: otherToken });
  check("another customer's wishlist is separate", otherWishlist.json.data?.length === 0);

  // -------------------------------------------------------------------------
  section("4. Checkout and orders");
  // -------------------------------------------------------------------------
  const size = first.sizes[0] ?? "One Size";
  await call("POST", "/cart", { token, body: { productId: first.slug, size, quantity: 2 } });
  purchased.push({ slug: first.slug, size, quantity: 2 });
  const movedSize = secondProduct.sizes[0] ?? "One Size";
  purchased.push({ slug: secondProduct.slug, size: movedSize, quantity: 1 });

  const placed = await call<ApiOrder>("POST", "/orders", {
    token,
    body: {
      customerName: qa.name,
      email: qa.email,
      phone: "+961 70 000 000",
      address: "1 QA Street",
      city: "Beirut",
      postalCode: "1000",
      country: "Lebanon",
      paymentMethod: "card",
      card: TEST_CARD,
      notes: "Temporary QA order — safe to delete",
    },
  });
  check("checkout creates an order", placed.status === 201, `status ${placed.status}`);
  const order = placed.json.data;
  check("order has an order number", /^VLN-\d{8}-\d{4}$/.test(order?.orderNumber ?? ""), order?.orderNumber);
  check("order has a placed date", Boolean(order?.createdAt) && !Number.isNaN(Date.parse(order.createdAt)));
  check("order has line items", (order?.items?.length ?? 0) === 2, `${order?.items?.length} items`);
  check("line items carry quantities", order?.items?.every((i) => i.quantity > 0) ?? false);
  check("line items carry prices", order?.items?.every((i) => i.unitPrice > 0 && i.totalPrice > 0) ?? false);
  check("order has a subtotal", (order?.subtotal ?? 0) > 0, `${order?.subtotal}`);
  check("order records a discount field", typeof order?.discount === "number", `${order?.discount}`);
  check("order records shipping", typeof order?.shipping === "number", `${order?.shipping}`);
  check(
    "total equals subtotal + shipping",
    Math.abs((order?.total ?? 0) - ((order?.subtotal ?? 0) + (order?.shipping ?? 0))) < 0.01,
    `${order?.total}`,
  );
  check("new order starts in a real status", ["pending", "paid"].includes(order?.status ?? ""), order?.status);

  const list = await call<ApiOrder[]>("GET", "/orders", { token });
  check("order appears in the customer's list", list.json.data?.some((o) => o.id === order.id) ?? false);
  check("list is scoped to this customer", list.json.data?.length === 1, `${list.json.data?.length} orders`);

  const detail = await call<ApiOrder>("GET", `/orders/${order.id}`, { token });
  check("order detail is readable by its owner", detail.status === 200 && detail.json.data?.id === order.id);

  const otherOrders = await call<ApiOrder[]>("GET", "/orders", { token: otherToken });
  check("another customer sees none of these orders", otherOrders.json.data?.length === 0);

  const stolen = await call("GET", `/orders/${order.id}`, { token: otherToken });
  check(
    "another customer cannot read this order",
    stolen.status === 404,
    `status ${stolen.status}`,
  );

  const anonOrder = await call("GET", `/orders/${order.id}`);
  check("anonymous cannot read the order", anonOrder.status === 401, `status ${anonOrder.status}`);

  // -------------------------------------------------------------------------
  section("5. Order status set by an admin, seen by the customer");
  // -------------------------------------------------------------------------
  const adminLogin = await call<AuthResult>("POST", "/auth/login", {
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.json.data?.token ?? "";
  check("admin can sign in", adminLogin.status === 200 && adminToken.length > 0);

  const forbidden = await call("GET", "/admin/orders", { token });
  check("a customer token is refused by admin routes", forbidden.status === 403, `status ${forbidden.status}`);

  for (const next of ["processing", "shipped", "delivered"]) {
    const updated = await call<ApiOrder>("PATCH", `/admin/orders/${order.id}/status`, {
      token: adminToken,
      body: { status: next },
    });
    check(`admin sets status to ${next}`, updated.status === 200 && updated.json.data?.status === next);

    const seen = await call<ApiOrder>("GET", `/orders/${order.id}`, { token });
    check(`customer reads back "${next}" from the database`, seen.json.data?.status === next, seen.json.data?.status);
  }

  // -------------------------------------------------------------------------
  section("6. Live chat");
  // -------------------------------------------------------------------------
  const started = await call<ChatConversation>("POST", "/chat/conversations", { token, body: {} });
  check("customer can start a conversation", started.status === 201, `status ${started.status}`);
  const conversationId = started.json.data?.id ?? "";

  const startedAgain = await call<ChatConversation>("POST", "/chat/conversations", { token, body: {} });
  check("starting again returns the same thread", startedAgain.json.data?.id === conversationId);

  const sent = await call<ChatMessage>("POST", `/chat/conversations/${conversationId}/messages`, {
    token,
    body: { message: "QA test message from the customer" },
  });
  check("customer can send a message", sent.status === 201, `status ${sent.status}`);
  check("message carries a timestamp", Boolean(sent.json.data?.createdAt));

  const stolenThread = await call("GET", `/chat/conversations/${conversationId}/messages`, {
    token: otherToken,
  });
  check(
    "another customer cannot read this conversation",
    stolenThread.status === 404,
    `status ${stolenThread.status}`,
  );

  const adminReply = await call<ChatMessage>(
    "POST",
    `/admin/chat/conversations/${conversationId}/messages`,
    { token: adminToken, body: { message: "QA test reply from support" } },
  );
  check("admin can reply", adminReply.status === 201, `status ${adminReply.status}`);

  const history = await call<ChatMessage[]>("GET", `/chat/conversations/${conversationId}/messages`, {
    token,
  });
  check("customer sees the full transcript", history.json.data?.length === 2, `${history.json.data?.length} messages`);
  check(
    "customer sees the admin reply",
    history.json.data?.some((m) => m.senderRole === "admin") ?? false,
  );

  const unread = await call<{ unread: number }>("GET", "/chat/unread", { token });
  check("unread count reflects the admin reply", unread.json.data?.unread === 1, `${unread.json.data?.unread}`);

  const read = await call<{ updated: number }>("PATCH", `/chat/conversations/${conversationId}/read`, {
    token,
  });
  check("marking read updates rows", (read.json.data?.updated ?? 0) >= 1);

  const afterRead = await call<{ unread: number }>("GET", "/chat/unread", { token });
  check("unread returns to zero", afterRead.json.data?.unread === 0, `${afterRead.json.data?.unread}`);

  const readState = await call<ChatMessage[]>("GET", `/chat/conversations/${conversationId}/messages`, {
    token,
  });
  check(
    "admin message is now flagged read",
    readState.json.data?.find((m) => m.senderRole === "admin")?.isRead === true,
  );

  const conversations = await call<ChatConversation[]>("GET", "/chat/conversations", { token });
  check("conversation list is scoped to the caller", conversations.json.data?.length === 1);
  const otherConversations = await call<ChatConversation[]>("GET", "/chat/conversations", {
    token: otherToken,
  });
  check("another customer has no conversations", otherConversations.json.data?.length === 0);

  // -------------------------------------------------------------------------
  section("7. Profile");
  // -------------------------------------------------------------------------
  const renamedEmail = `qa_customer_2026_${stamp}x@vielinea.test`;
  const updatedProfile = await call<AuthResult>("PUT", "/auth/me", {
    token,
    body: { name: "QA Customer Renamed", email: renamedEmail },
  });
  check("profile update succeeds", updatedProfile.status === 200, `status ${updatedProfile.status}`);
  check("name is persisted", updatedProfile.json.data?.user?.name === "QA Customer Renamed");
  const rotated = updatedProfile.json.data?.token ?? token;

  const reread = await call<{ user: ApiUser }>("GET", "/auth/me", { token: rotated });
  check("re-reading the session shows the new email", reread.json.data?.user?.email === renamedEmail);

  const clash = await call("PUT", "/auth/me", {
    token: rotated,
    body: { name: "QA Customer Renamed", email: qaOther.email },
  });
  check("taking another customer's email is refused", clash.status === 409, `status ${clash.status}`);

  const wrongCurrent = await call("PUT", "/auth/password", {
    token: rotated,
    body: { currentPassword: "not-the-password", newPassword: "qa-password-2027" },
  });
  check("password change needs the current password", wrongCurrent.status === 401, `status ${wrongCurrent.status}`);

  const changed = await call("PUT", "/auth/password", {
    token: rotated,
    body: { currentPassword: qa.password, newPassword: "qa-password-2027" },
  });
  check("password change succeeds", changed.status === 200, `status ${changed.status}`);

  const oldPassword = await call("POST", "/auth/login", {
    body: { email: renamedEmail, password: qa.password },
  });
  check("the old password no longer works", oldPassword.status === 401, `status ${oldPassword.status}`);

  const newPassword = await call<AuthResult>("POST", "/auth/login", {
    body: { email: renamedEmail, password: "qa-password-2027" },
  });
  check("the new password works", newPassword.status === 200, `status ${newPassword.status}`);

  // -------------------------------------------------------------------------
  section("8. Session persistence and logout");
  // -------------------------------------------------------------------------
  const persisted = await call<ApiOrder[]>("GET", "/orders", { token: newPassword.json.data.token });
  check("orders survive a fresh sign-in", persisted.json.data?.length === 1);

  const loggedOut = await call("POST", "/auth/logout");
  check("logout responds", loggedOut.status === 200, `status ${loggedOut.status}`);

  // -------------------------------------------------------------------------
  section("9. Cleanup — QA rows only");
  // -------------------------------------------------------------------------
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-e2e-account",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  // Stock consumed by the QA checkout goes back on the shelf.
  for (const line of purchased) {
    await client.query(
      "UPDATE public.products SET stock = stock + $2 WHERE slug = $1",
      [line.slug, line.quantity],
    );
    await client.query(
      `UPDATE public.product_sizes ps SET stock = ps.stock + $3
       FROM public.products p
       WHERE p.id = ps.product_id AND p.slug = $1 AND ps.size = $2`,
      [line.slug, line.size, line.quantity],
    );
  }

  // chat_threads.user_id is ON DELETE SET NULL, so the thread has to go first
  // or it would outlive the QA account as an orphan.
  const threads = await client.query(
    `DELETE FROM public.chat_threads
     WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE 'qa_customer_2026_%@vielinea.test')
     RETURNING id`,
  );
  const removed = await client.query(
    `DELETE FROM public.users
     WHERE email LIKE 'qa_customer_2026_%@vielinea.test'
     RETURNING email`,
  );

  const leftovers = await client.query<{ orders: number; threads: number }>(
    `SELECT (SELECT count(*)::int FROM public.orders o
               WHERE o.email LIKE 'qa_customer_2026_%@vielinea.test')          AS orders,
            (SELECT count(*)::int FROM public.chat_threads t
               WHERE t.customer_email LIKE 'qa_customer_2026_%@vielinea.test') AS threads`,
  );
  await client.end();

  check("QA chat threads removed", (threads.rowCount ?? 0) >= 1, `${threads.rowCount}`);
  check("QA accounts removed", (removed.rowCount ?? 0) === 2, `${removed.rowCount} accounts`);
  check("no QA orders left behind", leftovers.rows[0]?.orders === 0, `${leftovers.rows[0]?.orders}`);
  check("no QA chat threads left behind", leftovers.rows[0]?.threads === 0, `${leftovers.rows[0]?.threads}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`\nFailures:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`\nSuite crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
