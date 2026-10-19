import { query, queryMany, queryOne } from "../lib/db.js";
import type { ChatConversation, ChatMessage, ChatSenderRole } from "../types/models.js";

interface ThreadRow {
  id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  anonymous_number: number | null;
  status: "open" | "closed";
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
  unread_count: number;
  last_message_id: string | null;
  last_message_body: string | null;
  last_message_sender: ChatSenderRole | null;
  last_message_sender_id: string | null;
  last_message_read_at: Date | null;
  last_message_created_at: Date | null;
}

interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender: ChatSenderRole;
  body: string;
  read_at: Date | null;
  created_at: Date;
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.thread_id,
    senderId: row.sender_id,
    senderRole: row.sender,
    message: row.body,
    isRead: row.read_at !== null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toConversation(row: ThreadRow): ChatConversation {
  const lastMessage: ChatMessage | null =
    row.last_message_id && row.last_message_created_at
      ? {
          id: row.last_message_id,
          conversationId: row.id,
          senderId: row.last_message_sender_id,
          senderRole: row.last_message_sender ?? "customer",
          message: row.last_message_body ?? "",
          isRead: row.last_message_read_at !== null,
          createdAt: new Date(row.last_message_created_at).toISOString(),
        }
      : null;

  return {
    id: row.id,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    isGuest: row.anonymous_number !== null,
    anonymousNumber: row.anonymous_number,
    status: row.status,
    unreadCount: row.unread_count,
    lastMessage,
    lastMessageAt: new Date(row.last_message_at).toISOString(),
    // Overwritten by the service, which knows who is currently streaming.
    online: false,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Shared projection. $1 is the sender role whose unread messages should be
 * counted — i.e. the role the *viewer* is not. An admin viewing a thread counts
 * unread 'customer' messages; the customer counts unread 'admin' messages.
 */
const THREAD_SELECT = `
  SELECT t.id,
         t.user_id,
         t.customer_name,
         t.customer_email,
         t.anonymous_number,
         t.status,
         t.last_message_at,
         t.created_at,
         t.updated_at,
         COALESCE((
           SELECT count(*)::int FROM public.chat_messages m
            WHERE m.thread_id = t.id AND m.read_at IS NULL AND m.sender = $1
         ), 0) AS unread_count,
         last.id         AS last_message_id,
         last.body       AS last_message_body,
         last.sender     AS last_message_sender,
         last.sender_id  AS last_message_sender_id,
         last.read_at    AS last_message_read_at,
         last.created_at AS last_message_created_at
    FROM public.chat_threads t
    LEFT JOIN LATERAL (
      SELECT m.id, m.body, m.sender, m.sender_id, m.read_at, m.created_at
        FROM public.chat_messages m
       WHERE m.thread_id = t.id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
    ) last ON true
`;

export const chatRepository = {
  /** The customer's current open thread, if they have one. */
  async findOpenThreadForUser(userId: string): Promise<ChatConversation | null> {
    const row = await queryOne<ThreadRow>(
      `${THREAD_SELECT} WHERE t.user_id = $2 AND t.status = 'open' LIMIT 1`,
      ["admin", userId],
    );
    return row ? toConversation(row) : null;
  },

  /** Every thread belonging to one customer, newest activity first. */
  async listThreadsForUser(userId: string): Promise<ChatConversation[]> {
    const rows = await queryMany<ThreadRow>(
      `${THREAD_SELECT} WHERE t.user_id = $2 ORDER BY t.last_message_at DESC`,
      ["admin", userId],
    );
    return rows.map(toConversation);
  },

  /** Admin inbox. Unread counts are of customer messages. */
  async listThreadsForAdmin(status?: "open" | "closed"): Promise<ChatConversation[]> {
    const rows = await queryMany<ThreadRow>(
      `${THREAD_SELECT}
        WHERE ($2::text IS NULL OR t.status = $2)
        ORDER BY t.last_message_at DESC`,
      ["customer", status ?? null],
    );
    return rows.map(toConversation);
  },

  /**
   * One thread by id. `unreadFor` selects which side's unread count is
   * reported, matching THREAD_SELECT's $1.
   */
  async findThreadById(
    id: string,
    unreadFor: ChatSenderRole = "customer",
  ): Promise<ChatConversation | null> {
    const row = await queryOne<ThreadRow>(`${THREAD_SELECT} WHERE t.id = $2 LIMIT 1`, [
      unreadFor,
      id,
    ]);
    return row ? toConversation(row) : null;
  },

  /**
   * A guest's open thread, found by the hash of the token they hold. The raw
   * token is never stored, so this is the only way in — and a token that
   * matches nothing simply finds nothing.
   */
  async findOpenThreadForGuest(tokenHash: string): Promise<ChatConversation | null> {
    const row = await queryOne<ThreadRow>(
      `${THREAD_SELECT} WHERE t.guest_token_hash = $2 AND t.status = 'open' LIMIT 1`,
      ["admin", tokenHash],
    );
    return row ? toConversation(row) : null;
  },

  /** Any thread of the guest holding this token, open or closed. */
  async findThreadForGuest(id: string, tokenHash: string): Promise<ChatConversation | null> {
    const row = await queryOne<ThreadRow>(
      `${THREAD_SELECT} WHERE t.id = $2 AND t.guest_token_hash = $3 LIMIT 1`,
      ["admin", id, tokenHash],
    );
    return row ? toConversation(row) : null;
  },

  /**
   * Creates a guest thread and allocates its display number from the sequence
   * in the same statement, so the number is decided by the database and can
   * never be chosen, guessed or reused by a client.
   */
  async createGuestThread(tokenHash: string): Promise<string> {
    const row = await queryOne<{ id: string }>(
      `WITH n AS (SELECT nextval('public.chat_anonymous_number_seq')::int AS num)
       INSERT INTO public.chat_threads
         (user_id, guest_token_hash, anonymous_number, customer_name, customer_email, status)
       SELECT NULL, $1, n.num, 'Anonymous ' || n.num, '', 'open' FROM n
       RETURNING id`,
      [tokenHash],
    );
    if (!row) throw new Error("Failed to create guest chat conversation");
    return row.id;
  },

  async createThread(input: {
    userId: string;
    customerName: string;
    customerEmail: string;
    subject?: string | undefined;
  }): Promise<string> {
    // The partial unique index guarantees one open thread per customer; if a
    // concurrent request already created one, take that row instead of failing.
    const row = await queryOne<{ id: string }>(
      `WITH inserted AS (
         INSERT INTO public.chat_threads (user_id, customer_name, customer_email, status)
         VALUES ($1, $2, $3, 'open')
         ON CONFLICT DO NOTHING
         RETURNING id
       )
       SELECT id FROM inserted
       UNION ALL
       SELECT id FROM public.chat_threads
        WHERE user_id = $1 AND status = 'open'
       LIMIT 1`,
      [input.userId, input.customerName, input.customerEmail],
    );
    if (!row) throw new Error("Failed to create chat conversation");
    return row.id;
  },

  async listMessages(conversationId: string, limit = 200): Promise<ChatMessage[]> {
    // Newest `limit` rows, returned oldest-first so the transcript reads down.
    const rows = await queryMany<MessageRow>(
      `SELECT * FROM (
         SELECT m.id, m.thread_id, m.sender_id, m.sender, m.body, m.read_at, m.created_at
           FROM public.chat_messages m
          WHERE m.thread_id = $1
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT $2
       ) recent
       ORDER BY recent.created_at ASC, recent.id ASC`,
      [conversationId, limit],
    );
    return rows.map(toMessage);
  },

  async createMessage(input: {
    conversationId: string;
    /** Null for a guest: there is no account to attribute the message to. */
    senderId: string | null;
    senderRole: ChatSenderRole;
    message: string;
  }): Promise<ChatMessage> {
    const row = await queryOne<MessageRow>(
      `INSERT INTO public.chat_messages (thread_id, sender_id, sender, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, thread_id, sender_id, sender, body, read_at, created_at`,
      [input.conversationId, input.senderId, input.senderRole, input.message],
    );
    if (!row) throw new Error("Failed to store chat message");
    return toMessage(row);
  },

  /**
   * Marks the other side's unread messages in a thread as read.
   * `senderRole` is whose messages get marked — the opposite of the reader.
   * Returns the number of rows actually changed so the caller can skip a
   * pointless realtime broadcast.
   */
  async markThreadRead(conversationId: string, senderRole: ChatSenderRole): Promise<number> {
    const rows = await queryMany<{ id: string }>(
      `UPDATE public.chat_messages
          SET read_at = now()
        WHERE thread_id = $1 AND sender = $2 AND read_at IS NULL
        RETURNING id`,
      [conversationId, senderRole],
    );
    return rows.length;
  },

  /**
   * Marks a single message read. Returns the thread it belongs to so the caller
   * can verify ownership before trusting the result, or null when no such
   * message exists from that side.
   */
  async markMessageRead(
    messageId: string,
    senderRole: ChatSenderRole,
  ): Promise<{ conversationId: string; changed: boolean } | null> {
    const found = await queryOne<{ thread_id: string; read_at: Date | null }>(
      `SELECT thread_id, read_at FROM public.chat_messages WHERE id = $1 AND sender = $2`,
      [messageId, senderRole],
    );
    if (!found) return null;
    if (found.read_at !== null) return { conversationId: found.thread_id, changed: false };

    await query(`UPDATE public.chat_messages SET read_at = now() WHERE id = $1 AND read_at IS NULL`, [
      messageId,
    ]);
    return { conversationId: found.thread_id, changed: true };
  },

  /** Total unread across all of a customer's threads — drives the widget badge. */
  async unreadCountForUser(userId: string): Promise<number> {
    const row = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM public.chat_messages m
         JOIN public.chat_threads t ON t.id = m.thread_id
        WHERE t.user_id = $1 AND m.sender = 'admin' AND m.read_at IS NULL`,
      [userId],
    );
    return row?.n ?? 0;
  },

  /** Total unread customer messages across every thread — admin badge. */
  async unreadCountForAdmin(): Promise<number> {
    const row = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM public.chat_messages m
        WHERE m.sender = 'customer' AND m.read_at IS NULL`,
    );
    return row?.n ?? 0;
  },
};
