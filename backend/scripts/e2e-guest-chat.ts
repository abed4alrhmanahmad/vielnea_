/**
 * End-to-end test for anonymous guest live chat.
 *
 * Guests reuse the existing chat_threads / chat_messages tables and the same
 * realtime bus; a guest thread is one with user_id NULL, a stored token hash
 * and a display number allocated by the database.
 *
 * What this proves:
 *   - a visitor can chat with no account, no name and no email
 *   - the server assigns "Anonymous N", and it stays put
 *   - two guests never share a number, and neither can reach the other
 *   - a guest cannot choose their number, claim an account thread, or reach
 *     any admin endpoint
 *   - admins see the anonymous name and can reply
 *   - signed-in chat is untouched and still shows the real account identity
 *
 * Data: guest threads created here, plus one temporary QA customer under
 * @vielinea.test, are all deleted at the end. Seeded data is never touched.
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
  options: { body?: unknown; token?: string; guestToken?: string } = {},
): Promise<{ status: number; json: Envelope<T> }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.guestToken) headers["X-Guest-Token"] = options.guestToken;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const json = (await res.json()) as Envelope<T>;
  return { status: res.status, json };
}

interface Conversation {
  id: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  isGuest: boolean;
  anonymousNumber: number | null;
  status: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: "customer" | "admin";
  message: string;
}

type GuestSession = { conversation: Conversation; guestToken: string };

const qaEmail = `guestchat-qa-${Date.now()}@vielinea.test`;
const guestThreadIds: string[] = [];

async function startGuest(token?: string): Promise<GuestSession> {
  const res = await call<GuestSession>("POST", "/chat/guest/conversations", {
    body: {},
    ...(token ? { guestToken: token } : {}),
  });
  if (res.status !== 201) throw new Error(`guest start failed: ${res.status} ${res.json.message}`);
  const id = res.json.data.conversation.id;
  if (!guestThreadIds.includes(id)) guestThreadIds.push(id);
  return res.json.data;
}

async function main(): Promise<void> {
  console.log(`Anonymous guest live chat — end-to-end\n${"=".repeat(60)}`);

  const adminLogin = await call<{ token: string }>("POST", "/auth/login", {
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.json.data?.token ?? "";
  if (!adminToken) throw new Error("could not sign the admin in");

  // -- 1. A visitor can chat with no account --------------------------------
  section("1. Guest opens chat with no login");
  const anon = await call<GuestSession>("POST", "/chat/guest/conversations", { body: {} });
  check("guest starts a conversation unauthenticated", anon.status === 201, `status ${anon.status}`);
  const guestA = anon.json.data;
  if (guestA?.conversation?.id && !guestThreadIds.includes(guestA.conversation.id)) {
    guestThreadIds.push(guestA.conversation.id);
  }

  check("no account was created", guestA.conversation.userId === null);
  check("flagged as a guest thread", guestA.conversation.isGuest === true);
  check(
    "assigned an Anonymous display name",
    /^Anonymous \d+$/.test(guestA.conversation.customerName),
    guestA.conversation.customerName,
  );
  check(
    "display name matches the assigned number",
    guestA.conversation.customerName === `Anonymous ${guestA.conversation.anonymousNumber}`,
  );
  check("no email is collected", guestA.conversation.customerEmail === "");
  check("a session token is issued", (guestA.guestToken ?? "").length >= 32);

  const send = await call<Message>(
    "POST",
    `/chat/guest/conversations/${guestA.conversation.id}/messages`,
    { body: { message: "Hello, I have a question about an order." }, guestToken: guestA.guestToken },
  );
  check("guest sends a message without logging in", send.status === 201, `status ${send.status}`);
  check("guest message carries no account id", send.json.data?.senderId === null);

  // -- 2. The identity is stable --------------------------------------------
  section("2. Same guest keeps the same Anonymous number");
  const resumed = await startGuest(guestA.guestToken);
  check("same token resumes the same thread", resumed.conversation.id === guestA.conversation.id);
  check(
    "the Anonymous number does not change",
    resumed.conversation.anonymousNumber === guestA.conversation.anonymousNumber,
    resumed.conversation.customerName,
  );

  await call("POST", `/chat/guest/conversations/${guestA.conversation.id}/messages`, {
    body: { message: "Still me, a second message." },
    guestToken: guestA.guestToken,
  });
  const afterSecond = await startGuest(guestA.guestToken);
  check(
    "a second message does not mint a new identity",
    afterSecond.conversation.anonymousNumber === guestA.conversation.anonymousNumber,
    afterSecond.conversation.customerName,
  );

  // -- 3. Different guests, different identities ----------------------------
  section("3. Different guests get different numbers");
  const guestB = await startGuest();
  check(
    "second guest gets its own thread",
    guestB.conversation.id !== guestA.conversation.id,
  );
  check(
    "second guest gets a different Anonymous number",
    guestB.conversation.anonymousNumber !== guestA.conversation.anonymousNumber,
    `${guestA.conversation.customerName} vs ${guestB.conversation.customerName}`,
  );
  check("second guest also has no account", guestB.conversation.userId === null);

  // -- 4. Ownership ---------------------------------------------------------
  section("4. A guest reaches only their own conversation");
  const crossRead = await call("GET", `/chat/guest/conversations/${guestA.conversation.id}/messages`, {
    guestToken: guestB.guestToken,
  });
  check("guest B cannot read guest A's transcript -> 404", crossRead.status === 404, `status ${crossRead.status}`);

  const crossWrite = await call("POST", `/chat/guest/conversations/${guestA.conversation.id}/messages`, {
    body: { message: "hijack attempt" },
    guestToken: guestB.guestToken,
  });
  check("guest B cannot post into guest A's thread -> 404", crossWrite.status === 404, `status ${crossWrite.status}`);

  const noToken = await call("GET", `/chat/guest/conversations/${guestA.conversation.id}/messages`);
  check("a conversation id alone is not enough -> 400", noToken.status === 400, `status ${noToken.status}`);

  const bogus = await call("GET", `/chat/guest/conversations/${guestA.conversation.id}/messages`, {
    guestToken: "f".repeat(64),
  });
  check("an invented token opens nothing -> 404", bogus.status === 404, `status ${bogus.status}`);

  const ownRead = await call<Message[]>(
    "GET",
    `/chat/guest/conversations/${guestA.conversation.id}/messages`,
    { guestToken: guestA.guestToken },
  );
  check("guest A still reads their own transcript", ownRead.status === 200);
  check("transcript holds both guest messages", ownRead.json.data.length >= 2, `${ownRead.json.data.length}`);

  // -- 5. A guest cannot promote itself -------------------------------------
  section("5. A guest cannot choose its identity or escalate");
  const chosen = await call<GuestSession>("POST", "/chat/guest/conversations", {
    // Every one of these is ignored: the server owns the identity.
    body: { anonymousNumber: 9999, customerName: "Administrator", userId: "someone", isGuest: false },
  });
  if (chosen.json.data?.conversation?.id) guestThreadIds.push(chosen.json.data.conversation.id);
  check(
    "a requested Anonymous number is ignored",
    chosen.json.data.conversation.anonymousNumber !== 9999,
    `${chosen.json.data.conversation.customerName}`,
  );
  check(
    "a requested display name is ignored",
    /^Anonymous \d+$/.test(chosen.json.data.conversation.customerName),
    chosen.json.data.conversation.customerName,
  );
  check("a guest cannot claim an account", chosen.json.data.conversation.userId === null);

  const adminReach = await call("GET", "/admin/chat/conversations", {
    guestToken: guestA.guestToken,
  });
  check("a guest token opens no admin endpoint -> 401", adminReach.status === 401, `status ${adminReach.status}`);

  const customerReach = await call("GET", "/chat/conversations", { guestToken: guestA.guestToken });
  check(
    "a guest token is not a session -> 401",
    customerReach.status === 401,
    `status ${customerReach.status}`,
  );

  // -- 6. Validation and limits still apply ---------------------------------
  section("6. Existing protections still apply to guests");
  const empty = await call("POST", `/chat/guest/conversations/${guestA.conversation.id}/messages`, {
    body: { message: "   " },
    guestToken: guestA.guestToken,
  });
  check("empty message rejected -> 422", empty.status === 422, `status ${empty.status}`);

  const tooLong = await call("POST", `/chat/guest/conversations/${guestA.conversation.id}/messages`, {
    body: { message: "x".repeat(2100) },
    guestToken: guestA.guestToken,
  });
  check("over-long message rejected -> 422", tooLong.status === 422, `status ${tooLong.status}`);

  // -- 7. Admin side ---------------------------------------------------------
  section("7. Admin sees anonymous guests and can reply");
  const inbox = await call<Conversation[]>("GET", "/admin/chat/conversations", { token: adminToken });
  const seenA = inbox.json.data.find((c) => c.id === guestA.conversation.id);
  check("admin sees the guest conversation", Boolean(seenA), seenA?.customerName);
  check("admin sees the anonymous name", seenA?.customerName === guestA.conversation.customerName);
  check("admin sees it flagged as a guest", seenA?.isGuest === true);
  check("admin is shown no email for a guest", seenA?.customerEmail === "");

  const reply = await call<Message>(
    "POST",
    `/admin/chat/conversations/${guestA.conversation.id}/messages`,
    { token: adminToken, body: { message: "Hello! Happy to help with your order." } },
  );
  check("admin replies to the guest", reply.status === 201, `status ${reply.status}`);

  const guestSees = await call<Message[]>(
    "GET",
    `/chat/guest/conversations/${guestA.conversation.id}/messages`,
    { guestToken: guestA.guestToken },
  );
  check(
    "guest receives the admin reply",
    guestSees.json.data.some((m) => m.senderRole === "admin" && m.message.includes("Happy to help")),
  );

  const markRead = await call("PATCH", `/chat/guest/conversations/${guestA.conversation.id}/read`, {
    guestToken: guestA.guestToken,
  });
  check("guest can mark the reply read", markRead.status === 200, `status ${markRead.status}`);

  // -- 8. Signed-in chat is untouched ---------------------------------------
  section("8. Authenticated chat still identifies the real account");
  const reg = await call<{ token: string; user: { name: string; email: string } }>(
    "POST",
    "/auth/register",
    { body: { name: "Chat QA Customer", email: qaEmail, password: "chatqa12345" } },
  );
  const custToken = reg.json.data?.token ?? "";
  check("QA customer registered", Boolean(custToken));

  const custConv = await call<Conversation>("POST", "/chat/conversations", {
    token: custToken,
    body: {},
  });
  check("authenticated customer starts a conversation", custConv.status === 201);
  check("their thread is bound to their account", custConv.json.data.userId !== null);
  check("their thread is not a guest thread", custConv.json.data.isGuest === false);
  check(
    "admin sees their real name, not Anonymous",
    custConv.json.data.customerName === "Chat QA Customer",
    custConv.json.data.customerName,
  );
  check("their real email is retained", custConv.json.data.customerEmail === qaEmail);

  await call("POST", `/chat/conversations/${custConv.json.data.id}/messages`, {
    token: custToken,
    body: { message: "I have a question about my order." },
  });

  const inbox2 = await call<Conversation[]>("GET", "/admin/chat/conversations", { token: adminToken });
  const seenCustomer = inbox2.json.data.find((c) => c.id === custConv.json.data.id);
  check("admin sees the account conversation", Boolean(seenCustomer));
  check("admin sees the account identity", seenCustomer?.customerName === "Chat QA Customer");
  check("admin sees both kinds side by side", inbox2.json.data.some((c) => c.isGuest));

  // A guest token must not open an account's conversation either.
  const guestOnAccount = await call(
    "GET",
    `/chat/guest/conversations/${custConv.json.data.id}/messages`,
    { guestToken: guestA.guestToken },
  );
  check(
    "a guest cannot read an account's conversation -> 404",
    guestOnAccount.status === 404,
    `status ${guestOnAccount.status}`,
  );

  // -- 9. Cleanup ------------------------------------------------------------
  section("9. Cleanup — QA rows only");
  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-e2e-guest-chat",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();

  for (const id of guestThreadIds) {
    await client.query("DELETE FROM public.chat_threads WHERE id = $1", [id]);
  }
  // chat_threads.user_id is ON DELETE SET NULL, so the QA customer's thread
  // must go before the account or it would survive as an orphan.
  await client.query(
    `DELETE FROM public.chat_threads
      WHERE user_id = (SELECT id FROM public.users WHERE lower(email) = lower($1))`,
    [qaEmail],
  );
  await client.query("DELETE FROM public.users WHERE lower(email) = lower($1)", [qaEmail]);

  const left = await client.query<{ threads: number; users: number }>(
    `SELECT (SELECT count(*)::int FROM public.chat_threads WHERE id = ANY($2::uuid[])) AS threads,
            (SELECT count(*)::int FROM public.users WHERE lower(email) = lower($1)) AS users`,
    [qaEmail, guestThreadIds],
  );
  check("guest threads removed", left.rows[0]?.threads === 0, `${left.rows[0]?.threads}`);
  check("QA account removed", left.rows[0]?.users === 0, `${left.rows[0]?.users}`);
  await client.end();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`GUEST CHAT E2E: ${passed} passed, ${failed} failed`);
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
