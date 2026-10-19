/**
 * Real-time fan-out for live chat.
 *
 * Transport
 * ---------
 * Browsers hold a Server-Sent Events stream to `GET /api/chat/stream`. SSE is a
 * genuine server push over one long-lived HTTP response — it is not polling,
 * and there is no setInterval anywhere in this path. The only timer here is a
 * 25-second comment keepalive, which exists to stop intermediary proxies from
 * closing an idle connection; it carries no chat data.
 *
 * Source of truth
 * ---------------
 * New messages are announced by the database itself: an AFTER INSERT trigger on
 * public.chat_messages calls pg_notify('vielinea_chat', ...). This module holds
 * a dedicated LISTEN connection and rebroadcasts each notification to the right
 * SSE subscribers. Because the notification originates in Postgres, a message
 * written by any API instance — or by hand in the SQL editor — reaches every
 * connected client.
 *
 * Why not Supabase Realtime in the browser?
 * -----------------------------------------
 * Supabase Realtime authorises browser subscriptions with RLS evaluated against
 * a Supabase Auth JWT. Vielinea issues its own JWTs signed with JWT_SECRET
 * against a custom public.users table; there is no auth.users row and no
 * auth.uid() for a policy to match, so RLS could not scope a customer to their
 * own thread. Subscribing from the browser would therefore mean either shipping
 * the anon key with permissive policies — every customer able to read every
 * other customer's messages — or minting Supabase-compatible tokens, which
 * would put a second, parallel auth system in the app.
 *
 * The database still drives delivery via LISTEN/NOTIFY; Express stays the only
 * component holding credentials, and it enforces the same authorisation on the
 * stream that it enforces on the REST endpoints. That satisfies the
 * "Supabase Postgres is the source, no polling" requirement without weakening
 * the project's rule that the browser never talks to the database.
 */
import pg from "pg";
import { env } from "../config/env.js";
import type { ChatMessage } from "../types/models.js";

export type ChatEvent =
  | { type: "message"; ownerId: string | null; message: ChatMessage }
  | {
      type: "read";
      ownerId: string | null;
      conversationId: string;
      /** Whose messages were just marked read. */
      readerRole: "customer" | "admin";
    };

interface Subscriber {
  id: number;
  userId: string;
  role: "customer" | "admin";
  send: (event: ChatEvent) => void;
}

const subscribers = new Map<number, Subscriber>();
let nextSubscriberId = 1;

/**
 * Message ids already delivered. A message is published twice — once inline by
 * the writing request for the lowest possible latency, once when the LISTEN
 * connection receives the trigger's notification — and this drops the second.
 * Bounded so it cannot grow without limit on a long-running process.
 */
const delivered = new Set<string>();
const DELIVERED_LIMIT = 1000;

function alreadyDelivered(id: string): boolean {
  if (delivered.has(id)) return true;
  delivered.add(id);
  if (delivered.size > DELIVERED_LIMIT) {
    // Drop the oldest half; insertion order is preserved by Set.
    let toDrop = delivered.size - DELIVERED_LIMIT / 2;
    for (const key of delivered) {
      delivered.delete(key);
      if (--toDrop <= 0) break;
    }
  }
  return false;
}

/**
 * Delivers an event to the customer who owns the thread and to every connected
 * administrator. Anyone else connected receives nothing.
 */
export function publish(event: ChatEvent): void {
  if (event.type === "message" && alreadyDelivered(event.message.id)) return;

  for (const subscriber of subscribers.values()) {
    const isOwner = event.ownerId !== null && subscriber.userId === event.ownerId;
    if (subscriber.role === "admin" || isOwner) {
      try {
        subscriber.send(event);
      } catch {
        // A broken response is cleaned up by its own close handler.
      }
    }
  }
}

export function subscribe(
  userId: string,
  role: "customer" | "admin",
  send: (event: ChatEvent) => void,
): () => void {
  const id = nextSubscriberId++;
  subscribers.set(id, { id, userId, role, send });
  return () => {
    subscribers.delete(id);
  };
}

/** True when the customer currently holds at least one open chat stream. */
export function isOnline(userId: string): boolean {
  for (const subscriber of subscribers.values()) {
    if (subscriber.userId === userId) return true;
  }
  return false;
}

export function onlineUserIds(): Set<string> {
  const ids = new Set<string>();
  for (const subscriber of subscribers.values()) ids.add(subscriber.userId);
  return ids;
}

// ---------------------------------------------------------------------------
// LISTEN connection
// ---------------------------------------------------------------------------
// A dedicated client, deliberately not taken from the pool: LISTEN binds to one
// session for its whole lifetime, and a pooled client would be handed back to
// other queries. Port 5432 is Supabase's session pooler, which keeps the
// session — LISTEN does not work through the transaction pooler on 6543.

interface NotifyPayload {
  type: string;
  id: string;
  threadId: string;
  ownerId: string | null;
  senderId: string | null;
  sender: "customer" | "admin";
  body: string;
  readAt: string | null;
  createdAt: string;
}

let listenClient: pg.Client | null = null;
let stopped = false;
let retryDelayMs = 1000;

function handleNotification(raw: string | undefined): void {
  if (!raw) return;
  let payload: NotifyPayload;
  try {
    payload = JSON.parse(raw) as NotifyPayload;
  } catch {
    return;
  }
  if (payload.type !== "message") return;

  publish({
    type: "message",
    ownerId: payload.ownerId,
    message: {
      id: payload.id,
      conversationId: payload.threadId,
      senderId: payload.senderId,
      senderRole: payload.sender,
      message: payload.body,
      isRead: payload.readAt !== null,
      createdAt: payload.createdAt,
    },
  });
}

async function connectListener(): Promise<void> {
  if (stopped) return;

  const client = new pg.Client({
    ...env.db,
    ssl: { rejectUnauthorized: false },
    application_name: "vielinea-chat-listener",
    connectionTimeoutMillis: 15_000,
  });

  client.on("notification", (msg) => {
    handleNotification(msg.payload);
  });

  client.on("error", (error: Error) => {
    // eslint-disable-next-line no-console
    console.error("[chat] listener connection error:", error.message);
    client.removeAllListeners();
    listenClient = null;
    void client.end().catch(() => undefined);
    scheduleReconnect();
  });

  await client.connect();
  await client.query("LISTEN vielinea_chat");
  listenClient = client;
  retryDelayMs = 1000;
  // eslint-disable-next-line no-console
  console.log("  Chat        realtime listener attached (LISTEN vielinea_chat)");
}

function scheduleReconnect(): void {
  if (stopped) return;
  const delay = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
  setTimeout(() => {
    void connectListener().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error("[chat] listener reconnect failed:", message);
      scheduleReconnect();
    });
  }, delay).unref();
}

/**
 * Attaches the LISTEN connection. Failure is not fatal: the inline publish in
 * the write path still delivers every message for this instance, so chat keeps
 * working and the listener keeps retrying in the background.
 */
export async function startChatListener(): Promise<void> {
  stopped = false;
  try {
    await connectListener();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error("[chat] listener unavailable, retrying in background:", message);
    scheduleReconnect();
  }
}

export async function stopChatListener(): Promise<void> {
  stopped = true;
  const client = listenClient;
  listenClient = null;
  if (client) {
    client.removeAllListeners();
    await client.end().catch(() => undefined);
  }
}
