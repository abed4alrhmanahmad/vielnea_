/**
 * Admin live chat — real data only.
 *
 * Drop-in replacement for the localStorage mock that used to live in
 * admin/services/misc.ts. The exported names and shapes (ChatThread,
 * ChatMessage, useChatThreads, chatService.send, chatService.markRead) are
 * deliberately identical, so the existing admin chat screen renders unchanged
 * against Supabase data delivered through the Express API.
 *
 * Conversations, transcripts, unread counts and presence all come from the
 * server. Nothing is seeded and nothing is written to localStorage.
 */
import { useEffect, useMemo, useState } from "react";
import { QueryClient, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { openChatStream, type ChatStreamEvent } from "@/lib/api/chat-stream";

// --- shapes the existing admin UI consumes ---------------------------------

export interface ChatMessage {
  id: string;
  from: "customer" | "admin";
  text: string;
  /** Epoch milliseconds, as the previous mock exposed. */
  at: number;
}

export interface ChatThread {
  id: string;
  /** "Anonymous 17" for a guest, the account holder's name otherwise. */
  customerName: string;
  /** Empty for a guest — no email is ever collected from one. */
  customerEmail: string;
  /** True when no account is behind the thread. */
  isGuest: boolean;
  online: boolean;
  unread: number;
  messages: ChatMessage[];
}

// --- API payloads ----------------------------------------------------------

interface ApiChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: "customer" | "admin";
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface ApiChatConversation {
  id: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  isGuest: boolean;
  status: "open" | "closed";
  unreadCount: number;
  lastMessage: ApiChatMessage | null;
  lastMessageAt: string;
  online: boolean;
}

function toMessage(message: ApiChatMessage): ChatMessage {
  return {
    id: message.id,
    from: message.senderRole,
    text: message.message,
    at: new Date(message.createdAt).getTime(),
  };
}

const conversationsKey = ["admin", "chat", "conversations"] as const;
const messagesKey = (id: string) => ["admin", "chat", "messages", id] as const;

/**
 * The admin screen calls chatService.send/markRead imperatively, outside React,
 * so the active QueryClient is captured here when the hook mounts. The client
 * has exactly one; SSR never reaches this code because the hook runs in an
 * effect.
 */
let activeQueryClient: QueryClient | null = null;

export const chatService = {
  /** Fire-and-forget: the SSE event and refetch update the UI. */
  send(threadId: string, text: string): void {
    const body = text.trim();
    if (!body) return;
    void apiClient
      .post<ApiChatMessage>(`/admin/chat/conversations/${threadId}/messages`, { message: body })
      .then(() => {
        void activeQueryClient?.invalidateQueries({ queryKey: messagesKey(threadId) });
        void activeQueryClient?.invalidateQueries({ queryKey: conversationsKey });
      })
      .catch(() => {
        // Surfacing this would mean changing the admin UI, which is out of
        // scope here; a failed send simply leaves the transcript unchanged.
      });
  },

  markRead(threadId: string): void {
    void apiClient
      .patch<{ updated: number }>(`/admin/chat/conversations/${threadId}/read`)
      .then(() => {
        void activeQueryClient?.invalidateQueries({ queryKey: messagesKey(threadId) });
        void activeQueryClient?.invalidateQueries({ queryKey: conversationsKey });
      })
      .catch(() => undefined);
  },
};

/** Total unread customer messages across every conversation. */
export function useAdminChatUnread() {
  return useQuery({
    queryKey: ["admin", "chat", "unread"],
    queryFn: async () => apiClient.get<{ unread: number }>("/admin/chat/unread"),
    staleTime: 10_000,
  });
}

/**
 * Every conversation with its transcript.
 *
 * Transcripts are fetched per conversation because the admin screen reads
 * `thread.messages` directly for both the list preview and the open thread.
 * React Query caches them and the SSE stream invalidates only the conversation
 * that actually changed, so this settles to one request per conversation.
 */
export function useChatThreads(): ChatThread[] {
  const queryClient = useQueryClient();
  const [, forceRender] = useState(0);

  useEffect(() => {
    activeQueryClient = queryClient;
  }, [queryClient]);

  const conversationsQuery = useQuery({
    queryKey: conversationsKey,
    queryFn: async () => apiClient.get<ApiChatConversation[]>("/admin/chat/conversations"),
    staleTime: 10_000,
  });

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );

  const messageQueries = useQueries({
    queries: conversations.map((conversation) => ({
      queryKey: messagesKey(conversation.id),
      queryFn: async () =>
        apiClient.get<ApiChatMessage[]>(`/admin/chat/conversations/${conversation.id}/messages`),
      staleTime: 10_000,
    })),
  });

  // Push stream: new customer messages and read receipts arrive without the
  // admin refreshing. No polling anywhere in this path.
  useEffect(() => {
    const close = openChatStream({
      onEvent: (event: ChatStreamEvent) => {
        if (event.type === "message") {
          void queryClient.invalidateQueries({
            queryKey: messagesKey(event.message.conversationId),
          });
        } else {
          void queryClient.invalidateQueries({ queryKey: messagesKey(event.conversationId) });
        }
        void queryClient.invalidateQueries({ queryKey: conversationsKey });
        void queryClient.invalidateQueries({ queryKey: ["admin", "chat", "unread"] });
        forceRender((value) => value + 1);
      },
    });
    return close;
  }, [queryClient]);

  const transcripts = messageQueries.map((query) => query.data);

  return useMemo(
    () =>
      conversations.map((conversation, index) => {
        const loaded = transcripts[index];
        // Until a transcript arrives, the conversation's last message keeps the
        // list preview correct rather than showing an empty row.
        const messages = loaded
          ? loaded.map(toMessage)
          : conversation.lastMessage
            ? [toMessage(conversation.lastMessage)]
            : [];
        return {
          id: conversation.id,
          customerName: conversation.customerName,
          customerEmail: conversation.customerEmail,
          isGuest: conversation.isGuest,
          online: conversation.online,
          unread: conversation.unreadCount,
          messages,
        };
      }),
    // transcripts is a new array each render; comparing by content keeps the
    // memo honest without deep-equality machinery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversations, JSON.stringify(transcripts)],
  );
}
