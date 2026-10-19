/**
 * Guest live chat — for visitors with no account.
 *
 * The visitor never supplies a name, an email or anything else. On first use
 * the server creates a thread, allocates the display number ("Anonymous 17")
 * and mints a random token; the browser keeps only that token, in
 * localStorage, so the same conversation resumes across reloads.
 *
 * The token is the whole identity: the server stores only its hash and uses it
 * to prove ownership of exactly one conversation. Nothing here decides who the
 * visitor is, and the anonymous number is never sent from the browser.
 *
 * Signed-in customers do not use any of this — they keep the existing
 * authenticated chat in ./chat.ts, unchanged.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/api/client";
import { openChatStream, type ChatStreamEvent } from "@/lib/api/chat-stream";
import type { ChatConversation, ChatMessage } from "./chat";

const TOKEN_KEY = "vielinea_guest_chat_token";

export function readGuestToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private mode or blocked storage: chat still works for this page view,
    // it just cannot be resumed after a reload.
    return null;
  }
}

function writeGuestToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* nothing to do — see readGuestToken */
  }
}

const guestConversationKey = ["chat", "guest", "conversation"] as const;
const guestMessagesKey = (id: string) => ["chat", "guest", "messages", id] as const;

interface GuestSession {
  conversation: ChatConversation;
  guestToken: string;
}

/** Fetch helper: the guest has no bearer token, only the guest token header. */
async function guestFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers["X-Guest-Token"] = init.token;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const json = (await response.json()) as { success: boolean; data: T; message?: string };
  if (!response.ok || !json.success) {
    throw new Error(json.message ?? "Chat is unavailable right now");
  }
  return json.data;
}

/**
 * Starts or resumes the guest's conversation.
 *
 * Enabled only when the widget is open and nobody is signed in, so a visitor
 * who never opens chat never creates a thread.
 */
export function useGuestConversation(enabled: boolean) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: guestConversationKey,
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const session = await guestFetch<GuestSession>("/chat/guest/conversations", {
        method: "POST",
        body: {},
        token: readGuestToken(),
      });
      // Returned once, at creation; every later request carries it back.
      writeGuestToken(session.guestToken);
      void queryClient.invalidateQueries({ queryKey: guestMessagesKey(session.conversation.id) });
      return session;
    },
  });
}

export function useGuestMessages(conversationId: string | null) {
  return useQuery({
    queryKey: guestMessagesKey(conversationId ?? "none"),
    enabled: Boolean(conversationId),
    queryFn: async () =>
      guestFetch<ChatMessage[]>(`/chat/guest/conversations/${conversationId}/messages`, {
        token: readGuestToken(),
      }),
  });
}

export function useGuestSendMessage(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      if (!conversationId) throw new Error("No conversation open");
      return guestFetch<ChatMessage>(`/chat/guest/conversations/${conversationId}/messages`, {
        method: "POST",
        body: { message },
        token: readGuestToken(),
      });
    },
    onSuccess: (created) => {
      queryClient.setQueryData<ChatMessage[]>(
        guestMessagesKey(created.conversationId),
        (current) =>
          current && !current.some((m) => m.id === created.id) ? [...current, created] : current,
      );
    },
  });
}

export function useGuestMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) =>
      guestFetch<{ updated: number }>(`/chat/guest/conversations/${conversationId}/read`, {
        method: "PATCH",
        token: readGuestToken(),
      }),
    onSuccess: (_result, conversationId) => {
      queryClient.setQueryData<ChatMessage[]>(guestMessagesKey(conversationId), (current) =>
        current?.map((m) => (m.senderRole === "admin" ? { ...m, isRead: true } : m)),
      );
    },
  });
}

/**
 * Subscribes to the guest's push stream, using the same SSE client and the
 * same event shapes as the signed-in stream. There is no second chat system
 * and nothing polls.
 */
export function useGuestChatStream(conversationId: string | null): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = readGuestToken();
    if (!conversationId || !token) {
      setConnected(false);
      return;
    }

    const close = openChatStream({
      guest: { conversationId, token },
      onStatus: setConnected,
      onEvent: (event: ChatStreamEvent) => {
        if (event.type === "message") {
          const message = event.message;
          queryClient.setQueryData<ChatMessage[]>(
            guestMessagesKey(message.conversationId),
            (current) =>
              current && !current.some((m) => m.id === message.id)
                ? [...current, message]
                : current,
          );
        } else if (event.type === "read" && event.readerRole === "admin") {
          queryClient.setQueryData<ChatMessage[]>(
            guestMessagesKey(event.conversationId),
            (current) =>
              current?.map((m) => (m.senderRole === "customer" ? { ...m, isRead: true } : m)),
          );
        }
      },
    });

    return close;
  }, [conversationId, queryClient]);

  return connected;
}
