/**
 * Customer live chat — real data only.
 *
 * Every read and write goes to the Express API, which owns the Supabase
 * PostgreSQL tables. Nothing is seeded, mocked, or persisted to localStorage;
 * the only browser storage involved is the auth token the whole app already
 * uses. Refreshing the page re-reads the conversation from the database.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { openChatStream, type ChatStreamEvent } from "@/lib/api/chat-stream";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: "customer" | "admin";
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  status: "open" | "closed";
  unreadCount: number;
  lastMessage: ChatMessage | null;
  lastMessageAt: string;
  online: boolean;
  createdAt: string;
  updatedAt: string;
}

const conversationsKey = ["chat", "conversations"] as const;
const messagesKey = (id: string) => ["chat", "messages", id] as const;
const unreadKey = ["chat", "unread"] as const;

/**
 * Subscribes to the push stream and folds events into the query cache.
 * Mounted once by the chat widget; safe to mount from more than one place
 * because each call opens its own stream and updates the same shared cache.
 */
export function useChatStream(enabled: boolean): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const close = openChatStream({
      onStatus: setConnected,
      onEvent: (event: ChatStreamEvent) => {
        if (event.type === "message") {
          const incoming = event.message;
          queryClient.setQueryData<ChatMessage[]>(
            messagesKey(incoming.conversationId),
            (current) => {
              if (!current) return current;
              // The sender already has this row from the POST response.
              if (current.some((m) => m.id === incoming.id)) return current;
              return [...current, incoming];
            },
          );
        }
        // Conversation list and unread badge are derived server-side, so let
        // them refetch rather than trying to recompute counts in the client.
        void queryClient.invalidateQueries({ queryKey: conversationsKey });
        void queryClient.invalidateQueries({ queryKey: unreadKey });
      },
    });

    return close;
  }, [enabled, queryClient]);

  return connected;
}

/** The signed-in customer's conversations, newest activity first. */
export function useChatConversations(enabled: boolean) {
  return useQuery({
    queryKey: conversationsKey,
    queryFn: async () => apiClient.get<ChatConversation[]>("/chat/conversations"),
    enabled,
    staleTime: 10_000,
  });
}

export function useChatMessages(conversationId: string | null) {
  return useQuery({
    queryKey: messagesKey(conversationId ?? "none"),
    queryFn: async () => apiClient.get<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId),
    staleTime: 10_000,
  });
}

/** Total unread admin replies — drives the widget's badge. */
export function useChatUnread(enabled: boolean) {
  return useQuery({
    queryKey: unreadKey,
    queryFn: async () => apiClient.get<{ unread: number }>("/chat/unread"),
    enabled,
    staleTime: 10_000,
  });
}

/**
 * Resolves the conversation to show: the existing open one, or a newly created
 * one. POST /chat/conversations is idempotent server-side, so calling it twice
 * returns the same row rather than creating duplicates.
 */
export function useStartConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.post<ChatConversation>("/chat/conversations", {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

export function useSendChatMessage(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      if (!conversationId) throw new Error("No conversation open");
      return apiClient.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
        message,
      });
    },
    onSuccess: (created) => {
      queryClient.setQueryData<ChatMessage[]>(messagesKey(created.conversationId), (current) =>
        current && !current.some((m) => m.id === created.id) ? [...current, created] : current,
      );
      void queryClient.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

export function useMarkChatRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) =>
      apiClient.patch<{ updated: number }>(`/chat/conversations/${conversationId}/read`),
    onSuccess: (_result, conversationId) => {
      queryClient.setQueryData<ChatMessage[]>(messagesKey(conversationId), (current) =>
        current?.map((m) => (m.senderRole === "admin" ? { ...m, isRead: true } : m)),
      );
      void queryClient.invalidateQueries({ queryKey: conversationsKey });
      void queryClient.invalidateQueries({ queryKey: unreadKey });
    },
  });
}

/** Formats a message timestamp for the transcript. */
export function useChatTime() {
  return useCallback((iso: string) => {
    const date = new Date(iso);
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay
      ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  }, []);
}

/** The open conversation, if the customer has one. */
export function useOpenConversation(conversations: ChatConversation[] | undefined) {
  return useMemo(
    () => conversations?.find((conversation) => conversation.status === "open") ?? null,
    [conversations],
  );
}
