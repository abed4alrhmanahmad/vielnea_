/**
 * Live chat business logic.
 *
 * Authorisation rule, enforced in one place per identity kind:
 *
 *   account customer — may only touch a conversation whose
 *                      chat_threads.user_id equals their token subject.
 *                      `assertCustomerOwns` is the single gate.
 *   guest           — may only touch the conversation whose stored
 *                      guest_token_hash matches the token they present.
 *                      `assertGuestOwns` is the single gate; a conversation id
 *                      alone is never enough.
 *
 * Admins bypass ownership but are gated by authorizeAdmin on the route.
 *
 * A guest identity is minted entirely by this server: the token is random, the
 * display number comes from a database sequence, and neither can be supplied,
 * chosen or altered by a client.
 */
import { createHash, randomBytes } from "node:crypto";
import { chatRepository } from "../repositories/chat.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { publish, isOnline, onlineUserIds } from "../lib/chat-bus.js";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import type { ChatConversation, ChatMessage, ChatSenderRole } from "../types/models.js";

/** Loads a thread and refuses it unless the caller owns it. */
async function assertCustomerOwns(
  conversationId: string,
  userId: string,
): Promise<ChatConversation> {
  const conversation = await chatRepository.findThreadById(conversationId, "admin");
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.userId !== userId) {
    // Deliberately the same 404 a missing conversation produces, so the
    // endpoint cannot be used to discover which conversation ids exist.
    throw new NotFoundError("Conversation not found");
  }
  return conversation;
}

/**
 * The key an event is addressed to on the realtime bus.
 *
 * Account threads are addressed by user id, exactly as before. Guest threads
 * have no user id, so they are addressed by the thread itself — which is also
 * the only thing a guest's stream is allowed to subscribe to.
 */
export function ownerKeyOf(conversation: {
  id: string;
  userId: string | null;
  isGuest?: boolean;
}): string | null {
  if (conversation.userId) return conversation.userId;
  return conversation.isGuest ? guestStreamKey(conversation.id) : null;
}

export function guestStreamKey(conversationId: string): string {
  return `guest:${conversationId}`;
}

/** Only the hash is ever stored, so the database holds nothing that grants access. */
function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function withPresence(conversation: ChatConversation): ChatConversation {
  return {
    ...conversation,
    online: conversation.userId !== null && isOnline(conversation.userId),
  };
}

export const chatService = {
  // -------------------------------------------------------------------------
  // Customer
  // -------------------------------------------------------------------------

  /** Every conversation belonging to the signed-in customer. */
  async listForCustomer(userId: string): Promise<ChatConversation[]> {
    const conversations = await chatRepository.listThreadsForUser(userId);
    return conversations.map(withPresence);
  },

  /**
   * The customer's open conversation, created on first use. Idempotent: calling
   * it twice returns the same thread, which is what lets the widget resume
   * after a page refresh.
   */
  async startConversation(userId: string, subject?: string): Promise<ChatConversation> {
    const existing = await chatRepository.findOpenThreadForUser(userId);
    if (existing) return withPresence(existing);

    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError("Account not found");

    const id = await chatRepository.createThread({
      userId,
      customerName: user.name,
      customerEmail: user.email,
      subject,
    });
    const created = await chatRepository.findThreadById(id, "admin");
    if (!created) throw new NotFoundError("Conversation not found");
    return withPresence(created);
  },

  async messagesForCustomer(conversationId: string, userId: string): Promise<ChatMessage[]> {
    await assertCustomerOwns(conversationId, userId);
    return chatRepository.listMessages(conversationId);
  },

  async sendAsCustomer(
    conversationId: string,
    userId: string,
    message: string,
  ): Promise<ChatMessage> {
    const conversation = await assertCustomerOwns(conversationId, userId);
    if (conversation.status !== "open") {
      throw new ForbiddenError("This conversation has been closed");
    }
    return this.deliver(conversation, userId, "customer", message);
  },

  async markReadAsCustomer(conversationId: string, userId: string): Promise<{ updated: number }> {
    const conversation = await assertCustomerOwns(conversationId, userId);
    // A customer reads the admin's messages.
    const updated = await chatRepository.markThreadRead(conversationId, "admin");
    if (updated > 0) {
      publish({
        type: "read",
        ownerId: ownerKeyOf(conversation),
        conversationId,
        readerRole: "customer",
      });
    }
    return { updated };
  },

  async markMessageReadAsCustomer(messageId: string, userId: string): Promise<{ updated: number }> {
    const result = await chatRepository.markMessageRead(messageId, "admin");
    if (!result) throw new NotFoundError("Message not found");
    const conversation = await assertCustomerOwns(result.conversationId, userId);
    if (result.changed) {
      publish({
        type: "read",
        ownerId: ownerKeyOf(conversation),
        conversationId: result.conversationId,
        readerRole: "customer",
      });
    }
    return { updated: result.changed ? 1 : 0 };
  },

  async unreadForCustomer(userId: string): Promise<{ unread: number }> {
    return { unread: await chatRepository.unreadCountForUser(userId) };
  },

  // -------------------------------------------------------------------------
  // Guest (no account, no personal data)
  // -------------------------------------------------------------------------

  /**
   * Starts, or resumes, the conversation belonging to the bearer of `token`.
   *
   * With no token — a first-time visitor — a thread is created, a fresh random
   * token is minted and the display number is allocated by the database. The
   * raw token is returned exactly once here; only its hash is stored.
   *
   * With a token that still matches an open thread, that same thread comes
   * back, which is what keeps a guest "Anonymous 17" across reloads and
   * messages. A token matching nothing is treated as a first-time visitor
   * rather than an error, so a cleared or stale value simply starts over.
   */
  async startGuestConversation(
    token?: string,
  ): Promise<{ conversation: ChatConversation; guestToken: string }> {
    if (token) {
      const existing = await chatRepository.findOpenThreadForGuest(hashGuestToken(token));
      if (existing) return { conversation: withPresence(existing), guestToken: token };
    }

    const guestToken = randomBytes(32).toString("hex");
    const id = await chatRepository.createGuestThread(hashGuestToken(guestToken));
    const created = await chatRepository.findThreadById(id, "admin");
    if (!created) throw new NotFoundError("Conversation not found");
    return { conversation: withPresence(created), guestToken };
  },

  /**
   * The single ownership gate for guests. The conversation id on its own is
   * never sufficient — the token must hash to the one stored on that row.
   */
  async assertGuestOwns(conversationId: string, token: string): Promise<ChatConversation> {
    const conversation = await chatRepository.findThreadForGuest(
      conversationId,
      hashGuestToken(token),
    );
    // The same 404 a missing conversation gives, so the endpoint cannot be
    // used to probe which conversation ids exist or who owns them.
    if (!conversation) throw new NotFoundError("Conversation not found");
    return conversation;
  },

  async messagesForGuest(conversationId: string, token: string): Promise<ChatMessage[]> {
    await this.assertGuestOwns(conversationId, token);
    return chatRepository.listMessages(conversationId);
  },

  async sendAsGuest(
    conversationId: string,
    token: string,
    message: string,
  ): Promise<ChatMessage> {
    const conversation = await this.assertGuestOwns(conversationId, token);
    if (conversation.status !== "open") {
      throw new ForbiddenError("This conversation has been closed");
    }
    // senderId is null: a guest has no account to attribute the message to.
    return this.deliver(conversation, null, "customer", message);
  },

  async markReadAsGuest(conversationId: string, token: string): Promise<{ updated: number }> {
    const conversation = await this.assertGuestOwns(conversationId, token);
    const updated = await chatRepository.markThreadRead(conversationId, "admin");
    if (updated > 0) {
      publish({
        type: "read",
        ownerId: ownerKeyOf(conversation),
        conversationId,
        readerRole: "customer",
      });
    }
    return { updated };
  },

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  async listForAdmin(status?: "open" | "closed"): Promise<ChatConversation[]> {
    const conversations = await chatRepository.listThreadsForAdmin(status);
    const online = onlineUserIds();
    return conversations.map((conversation) => ({
      ...conversation,
      online: conversation.userId !== null && online.has(conversation.userId),
    }));
  },

  async messagesForAdmin(conversationId: string): Promise<ChatMessage[]> {
    const conversation = await chatRepository.findThreadById(conversationId, "customer");
    if (!conversation) throw new NotFoundError("Conversation not found");
    return chatRepository.listMessages(conversationId);
  },

  async sendAsAdmin(
    conversationId: string,
    adminId: string,
    message: string,
  ): Promise<ChatMessage> {
    const conversation = await chatRepository.findThreadById(conversationId, "customer");
    if (!conversation) throw new NotFoundError("Conversation not found");
    return this.deliver(conversation, adminId, "admin", message);
  },

  async markReadAsAdmin(conversationId: string): Promise<{ updated: number }> {
    const conversation = await chatRepository.findThreadById(conversationId, "customer");
    if (!conversation) throw new NotFoundError("Conversation not found");
    // An admin reads the customer's messages.
    const updated = await chatRepository.markThreadRead(conversationId, "customer");
    if (updated > 0) {
      publish({
        type: "read",
        ownerId: ownerKeyOf(conversation),
        conversationId,
        readerRole: "admin",
      });
    }
    return { updated };
  },

  async markMessageReadAsAdmin(messageId: string): Promise<{ updated: number }> {
    const result = await chatRepository.markMessageRead(messageId, "customer");
    if (!result) throw new NotFoundError("Message not found");
    const conversation = await chatRepository.findThreadById(result.conversationId, "customer");
    if (result.changed) {
      publish({
        type: "read",
        ownerId: conversation ? ownerKeyOf(conversation) : null,
        conversationId: result.conversationId,
        readerRole: "admin",
      });
    }
    return { updated: result.changed ? 1 : 0 };
  },

  async unreadForAdmin(): Promise<{ unread: number }> {
    return { unread: await chatRepository.unreadCountForAdmin() };
  },

  // -------------------------------------------------------------------------
  // Shared
  // -------------------------------------------------------------------------

  /**
   * Persists the message, then publishes it.
   *
   * The database's AFTER INSERT trigger also fires pg_notify, and the LISTEN
   * connection will republish the same row; chat-bus deduplicates by message
   * id. Publishing inline as well means delivery does not depend on the
   * listener being attached at this instant.
   */
  async deliver(
    conversation: ChatConversation,
    senderId: string | null,
    senderRole: ChatSenderRole,
    message: string,
  ): Promise<ChatMessage> {
    const stored = await chatRepository.createMessage({
      conversationId: conversation.id,
      senderId,
      senderRole,
      message,
    });
    publish({ type: "message", ownerId: ownerKeyOf(conversation), message: stored });
    return stored;
  },
};
