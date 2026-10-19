/**
 * Server-Sent Events client for live chat.
 *
 * Uses fetch + a ReadableStream reader rather than the built-in EventSource,
 * because EventSource cannot set an Authorization header — it would force the
 * stream to rely on the auth cookie, which a cross-site production deployment
 * (SameSite=strict) would drop. This sends the same bearer token every other
 * API call uses.
 *
 * This is a push stream: the connection stays open and the server writes as
 * events happen. Nothing here polls. The reconnect backoff only runs after the
 * connection actually drops.
 */
import { API_BASE_URL, getToken } from "./client";

export interface ChatStreamMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: "customer" | "admin";
  message: string;
  isRead: boolean;
  createdAt: string;
}

export type ChatStreamEvent =
  | { type: "message"; ownerId: string | null; message: ChatStreamMessage }
  | {
      type: "read";
      ownerId: string | null;
      conversationId: string;
      readerRole: "customer" | "admin";
    };

export interface ChatStreamHandlers {
  onEvent: (event: ChatStreamEvent) => void;
  /** Fired on connect and disconnect so the UI can show a live indicator. */
  onStatus?: (connected: boolean) => void;
  /**
   * Opens the guest stream instead of the signed-in one. The guest holds no
   * bearer token; the server scopes the subscription to the single
   * conversation this token owns, after checking that ownership.
   */
  guest?: { conversationId: string; token: string };
}

/**
 * Opens the stream and keeps it open until the returned function is called.
 * Reconnects with exponential backoff (1s → 30s) if the connection drops.
 */
export function openChatStream(handlers: ChatStreamHandlers): () => void {
  let closed = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let delay = 1000;

  async function connect(): Promise<void> {
    if (closed) return;

    const guest = handlers.guest;
    const token = getToken();
    if (!guest && !token) {
      // Signed out — nothing to subscribe to. Retry in case a login follows.
      schedule();
      return;
    }

    controller = new AbortController();
    try {
      const url = guest
        ? `${API_BASE_URL}/chat/guest/stream?id=${encodeURIComponent(guest.conversationId)}`
        : `${API_BASE_URL}/chat/stream`;
      const headers: Record<string, string> = { Accept: "text/event-stream" };
      if (guest) headers["X-Guest-Token"] = guest.token;
      else headers["Authorization"] = `Bearer ${token as string}`;

      const response = await fetch(url, {
        headers,
        credentials: "include",
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        handlers.onStatus?.(false);
        schedule();
        return;
      }

      handlers.onStatus?.(true);
      delay = 1000;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          handleFrame(frame);
          split = buffer.indexOf("\n\n");
        }
      }
    } catch {
      // Aborted by close(), or the network dropped. Both are handled below.
    }

    handlers.onStatus?.(false);
    schedule();
  }

  function handleFrame(frame: string): void {
    // Ignore keep-alive comment frames (": keep-alive") and the retry hint.
    const dataLines = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) return;

    try {
      const parsed = JSON.parse(dataLines.join("\n")) as ChatStreamEvent | { role: string };
      if ("type" in parsed) handlers.onEvent(parsed);
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  }

  function schedule(): void {
    if (closed) return;
    retryTimer = setTimeout(() => {
      void connect();
    }, delay);
    delay = Math.min(delay * 2, 30_000);
  }

  void connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller?.abort();
  };
}
