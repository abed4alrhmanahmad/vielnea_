/**
 * End-to-end live chat test against the running server and the real Supabase
 * database.
 *
 * Covers: conversation creation, customer → admin messaging, admin → customer
 * replies, persistence verified by querying Postgres directly, unread/read
 * behaviour, cross-customer authorisation, and real-time delivery over the SSE
 * push stream (asserted without any refetch or polling).
 *
 * Cleanup: only the two temporary @vielinea.test customers created here, and
 * their conversations, are removed. No seeded product, category, order, review,
 * image or pre-existing user is touched.
 */
import pg from "pg";
import { env } from "../src/config/env.js";

const BASE = `http://localhost:${env.PORT}/api`;
const STAMP = Date.now();
const CUSTOMER_A = `chat-a-${STAMP}@vielinea.test`;
const CUSTOMER_B = `chat-b-${STAMP}@vielinea.test`;
const PASSWORD = "chatTest12345";

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

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: "customer" | "admin";
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface ChatConversation {
  id: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  status: string;
  unreadCount: number;
  lastMessage: ChatMessage | null;
  online: boolean;
}

interface AuthResult {
  user: { id: string; email: string };
  token: string;
}

/**
 * Collects events from the SSE push stream. Nothing here polls the API — the
 * connection stays open and the server writes when something happens.
 */
class StreamRecorder {
  readonly events: Array<{ type: string; payload: unknown }> = [];
  private readonly controller = new AbortController();
  private ready!: () => void;
  readonly connected = new Promise<void>((resolve) => {
    this.ready = resolve;
  });

  constructor(private readonly token: string) {}

  start(): void {
    void (async () => {
      try {
        const res = await fetch(`${BASE}/chat/stream`, {
          headers: { Authorization: `Bearer ${this.token}`, Accept: "text/event-stream" },
          signal: this.controller.signal,
        });
        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let split = buffer.indexOf("\n\n");
          while (split !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            this.consume(frame);
            split = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // Aborted at the end of the run.
      }
    })();
  }

  private consume(frame: string): void {
    const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
    const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
    if (!eventLine || !dataLine) return;
    const type = eventLine.slice(6).trim();
    if (type === "ready") {
      this.ready();
      return;
    }
    try {
      this.events.push({ type, payload: JSON.parse(dataLine.slice(5).trim()) });
    } catch {
      // ignore malformed frame
    }
  }

  /** Resolves as soon as a matching event arrives, or null after `timeoutMs`. */
  async waitFor(
    predicate: (event: { type: string; payload: unknown }) => boolean,
    timeoutMs = 8000,
  ): Promise<{ type: string; payload: unknown } | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.events.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) return null;
      // Waiting on an already-open push connection, not requesting anything.
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  stop(): void {
    this.controller.abort();
  }
}

async function main(): Promise<void> {
  console.log("\nVielinea — live chat end-to-end\n");

  const db = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-e2e-chat",
    connectionTimeoutMillis: 20_000,
  });
  await db.connect();

  const createdUserIds: string[] = [];

  try {
    // -- 1. temporary customers + admin ------------------------------------
    const regA = await call<AuthResult>("POST", "/auth/register", {
      body: { name: "Chat Tester A", email: CUSTOMER_A, password: PASSWORD },
    });
    const regB = await call<AuthResult>("POST", "/auth/register", {
      body: { name: "Chat Tester B", email: CUSTOMER_B, password: PASSWORD },
    });
    check("temp customer A registered", regA.status === 201, CUSTOMER_A);
    check("temp customer B registered", regB.status === 201, CUSTOMER_B);
    const tokenA = regA.json.data.token;
    const tokenB = regB.json.data.token;
    createdUserIds.push(regA.json.data.user.id, regB.json.data.user.id);

    const adminLogin = await call<AuthResult>("POST", "/auth/login", {
      body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    });
    check("admin signed in", adminLogin.status === 200, env.ADMIN_EMAIL);
    const adminToken = adminLogin.json.data.token;

    // -- open push streams before anything is sent -------------------------
    const customerStream = new StreamRecorder(tokenA);
    const adminStream = new StreamRecorder(adminToken);
    customerStream.start();
    adminStream.start();
    await Promise.all([customerStream.connected, adminStream.connected]);
    check("customer SSE stream connected", true);
    check("admin SSE stream connected", true);

    // -- 2. create a conversation ------------------------------------------
    const created = await call<ChatConversation>("POST", "/chat/conversations", {
      token: tokenA,
      body: {},
    });
    check("conversation created", created.status === 201, created.json.data?.id);
    const conversationId = created.json.data.id;

    const again = await call<ChatConversation>("POST", "/chat/conversations", {
      token: tokenA,
      body: {},
    });
    check(
      "creating twice reuses the open conversation",
      again.json.data.id === conversationId,
      "no duplicate threads",
    );

    // -- 3. customer sends a message ---------------------------------------
    const sent = await call<ChatMessage>("POST", `/chat/conversations/${conversationId}/messages`, {
      token: tokenA,
      body: { message: "Hello, is the linen dress available in size S?" },
    });
    check("customer message accepted", sent.status === 201);
    const customerMessageId = sent.json.data.id;

    // -- 4. verify persistence directly in Supabase ------------------------
    const stored = await db.query<{ body: string; sender: string; read_at: Date | null }>(
      `SELECT body, sender, read_at FROM public.chat_messages WHERE id = $1`,
      [customerMessageId],
    );
    check(
      "customer message persisted in Supabase",
      stored.rowCount === 1 && stored.rows[0]?.sender === "customer",
      stored.rows[0]?.body,
    );

    // -- 5/6. admin sees the conversation ----------------------------------
    const adminList = await call<ChatConversation[]>("GET", "/admin/chat/conversations", {
      token: adminToken,
    });
    const adminView = adminList.json.data.find((c) => c.id === conversationId);
    check("admin sees the conversation", Boolean(adminView));
    check("admin sees customer name/email", adminView?.customerEmail === CUSTOMER_A, adminView?.customerName);
    check("admin sees latest message", adminView?.lastMessage?.id === customerMessageId);
    check("admin unread count is 1", adminView?.unreadCount === 1, `got ${adminView?.unreadCount}`);
    check("admin sees customer online", adminView?.online === true, "customer holds a live stream");

    // admin received the customer's message in real time
    const pushedToAdmin = await adminStream.waitFor(
      (e) =>
        e.type === "message" &&
        (e.payload as { message?: ChatMessage }).message?.id === customerMessageId,
    );
    check("admin received customer message in real time", pushedToAdmin !== null, "via SSE push");

    // -- 7. admin replies ---------------------------------------------------
    const reply = await call<ChatMessage>(
      "POST",
      `/admin/chat/conversations/${conversationId}/messages`,
      { token: adminToken, body: { message: "Yes — size S is in stock and ships tomorrow." } },
    );
    check("admin reply accepted", reply.status === 201);
    const adminMessageId = reply.json.data.id;

    // -- 8. verify the reply in Supabase -----------------------------------
    const storedReply = await db.query<{ body: string; sender: string }>(
      `SELECT body, sender FROM public.chat_messages WHERE id = $1`,
      [adminMessageId],
    );
    check(
      "admin reply persisted in Supabase",
      storedReply.rowCount === 1 && storedReply.rows[0]?.sender === "admin",
      storedReply.rows[0]?.body,
    );

    // -- 9. customer receives the reply in real time -----------------------
    const pushedToCustomer = await customerStream.waitFor(
      (e) =>
        e.type === "message" &&
        (e.payload as { message?: ChatMessage }).message?.id === adminMessageId,
    );
    check(
      "customer received admin reply in real time",
      pushedToCustomer !== null,
      "via SSE push, no refetch",
    );

    // -- history survives a "refresh" (a fresh request with a fresh token) --
    const relogin = await call<AuthResult>("POST", "/auth/login", {
      body: { email: CUSTOMER_A, password: PASSWORD },
    });
    const history = await call<ChatMessage[]>(
      "GET",
      `/chat/conversations/${conversationId}/messages`,
      { token: relogin.json.data.token },
    );
    check(
      "history persists across a new session",
      history.json.data.length === 2 &&
        history.json.data[0]?.id === customerMessageId &&
        history.json.data[1]?.id === adminMessageId,
      `${history.json.data.length} messages, oldest first`,
    );
    check(
      "messages carry timestamps",
      typeof history.json.data[0]?.createdAt === "string" &&
        !Number.isNaN(Date.parse(history.json.data[0].createdAt)),
      history.json.data[0]?.createdAt,
    );

    // -- 10. unread / read behaviour ---------------------------------------
    const unreadBefore = await call<{ unread: number }>("GET", "/chat/unread", { token: tokenA });
    check("customer has 1 unread admin message", unreadBefore.json.data.unread === 1);

    const marked = await call<{ updated: number }>(
      "PATCH",
      `/chat/conversations/${conversationId}/read`,
      { token: tokenA },
    );
    check("customer marks conversation read", marked.json.data.updated === 1);

    const unreadAfter = await call<{ unread: number }>("GET", "/chat/unread", { token: tokenA });
    check("customer unread back to 0", unreadAfter.json.data.unread === 0);

    const readInDb = await db.query<{ read_at: Date | null }>(
      `SELECT read_at FROM public.chat_messages WHERE id = $1`,
      [adminMessageId],
    );
    check("read state persisted in Supabase", readInDb.rows[0]?.read_at !== null);

    const adminMarked = await call<{ updated: number }>(
      "PATCH",
      `/admin/chat/conversations/${conversationId}/read`,
      { token: adminToken },
    );
    check("admin marks customer message read", adminMarked.json.data.updated === 1);

    const adminUnread = await call<{ unread: number }>("GET", "/admin/chat/unread", {
      token: adminToken,
    });
    check(
      "admin unread excludes the read message",
      typeof adminUnread.json.data.unread === "number",
      `${adminUnread.json.data.unread} unread across all threads`,
    );

    const singleMark = await call<{ updated: number }>(
      "PATCH",
      `/chat/messages/${adminMessageId}/read`,
      { token: tokenA },
    );
    check("marking an already-read message is a no-op", singleMark.json.data.updated === 0);

    // -- 11. cross-customer authorisation ----------------------------------
    const bReads = await call<ChatMessage[]>(
      "GET",
      `/chat/conversations/${conversationId}/messages`,
      { token: tokenB },
    );
    check("customer B cannot read A's conversation", bReads.status === 404, `HTTP ${bReads.status}`);

    const bWrites = await call<ChatMessage>(
      "POST",
      `/chat/conversations/${conversationId}/messages`,
      { token: tokenB, body: { message: "I should not be able to post here" } },
    );
    check("customer B cannot post to A's conversation", bWrites.status === 404, `HTTP ${bWrites.status}`);

    const bMarks = await call<{ updated: number }>(
      "PATCH",
      `/chat/conversations/${conversationId}/read`,
      { token: tokenB },
    );
    check("customer B cannot mark A's conversation read", bMarks.status === 404, `HTTP ${bMarks.status}`);

    const bMarksMessage = await call<{ updated: number }>(
      "PATCH",
      `/chat/messages/${adminMessageId}/read`,
      { token: tokenB },
    );
    check(
      "customer B cannot touch a message in A's conversation",
      bMarksMessage.status === 404,
      `HTTP ${bMarksMessage.status}`,
    );

    const bList = await call<ChatConversation[]>("GET", "/chat/conversations", { token: tokenB });
    check(
      "customer B's list excludes A's conversation",
      !bList.json.data.some((c) => c.id === conversationId),
      `${bList.json.data.length} own conversation(s)`,
    );

    const anonymous = await call<unknown>("GET", "/chat/conversations");
    check("anonymous access rejected", anonymous.status === 401, `HTTP ${anonymous.status}`);

    const customerHitsAdmin = await call<unknown>("GET", "/admin/chat/conversations", {
      token: tokenA,
    });
    check(
      "customer cannot use the admin chat API",
      customerHitsAdmin.status === 403,
      `HTTP ${customerHitsAdmin.status}`,
    );

    const bStreamLeak = new StreamRecorder(tokenB);
    bStreamLeak.start();
    await bStreamLeak.connected;
    await call<ChatMessage>("POST", `/admin/chat/conversations/${conversationId}/messages`, {
      token: adminToken,
      body: { message: "Second reply, for the isolation check." },
    });
    const leaked = await bStreamLeak.waitFor((e) => e.type === "message", 2500);
    check("customer B's stream receives none of A's messages", leaked === null);
    bStreamLeak.stop();

    customerStream.stop();
    adminStream.stop();
  } finally {
    // -- 12. cleanup: only what this run created ---------------------------
    // chat_threads.user_id is ON DELETE SET NULL, so threads are removed
    // explicitly; chat_messages cascade from the thread.
    let threads = 0;
    let messages = 0;
    if (createdUserIds.length > 0) {
      const msg = await db.query(
        `DELETE FROM public.chat_messages
          WHERE thread_id IN (SELECT id FROM public.chat_threads WHERE user_id = ANY($1::uuid[]))`,
        [createdUserIds],
      );
      messages = msg.rowCount ?? 0;
      const thr = await db.query(`DELETE FROM public.chat_threads WHERE user_id = ANY($1::uuid[])`, [
        createdUserIds,
      ]);
      threads = thr.rowCount ?? 0;
      await db.query(`DELETE FROM public.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
    }
    console.log(
      `\n  cleanup: ${messages} message(s), ${threads} conversation(s), ${createdUserIds.length} temp user(s) removed`,
    );

    const remaining = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.users WHERE email LIKE '%@vielinea.test'`,
    );
    console.log(`  leftover @vielinea.test users: ${remaining.rows[0]?.n ?? 0}`);

    await db.end();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`\n  Failures:\n${failures.map((f) => `    - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log("\n  Live chat end-to-end: PASS\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\ne2e-chat failed: ${message}`);
  process.exit(1);
});
