/**
 * Messages — the full-page view of the same live chat the floating widget uses.
 *
 * This is not a second chat system: it calls the identical hooks in
 * services/chat.ts, which read and write /api/chat/* and share one React Query
 * cache. The SSE push stream is already open — <Shell /> always renders
 * <ChatWidget />, which mounts useChatStream — so admin replies land in that
 * shared cache and re-render this page without a second connection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorPanel } from "@/components/account/error-panel";
import { useStore } from "@/contexts/store-context";
import { errorMessage } from "@/lib/api/client";
import {
  useChatConversations,
  useChatMessages,
  useChatTime,
  useMarkChatRead,
  useOpenConversation,
  useSendChatMessage,
  useStartConversation,
} from "@/services/chat";

export const Route = createFileRoute("/account/messages")({
  head: () => ({
    meta: [{ title: "Messages — Vielinea" }, { name: "robots", content: "noindex" }],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { isAuthenticated } = useStore();
  const conversationsQuery = useChatConversations(isAuthenticated);
  const conversations = conversationsQuery.data ?? [];
  const openConversation = useOpenConversation(conversations);
  const startConversation = useStartConversation();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to the open thread once the list arrives, without pinning the
  // choice if the customer then picks a different one.
  const activeId = selectedId ?? openConversation?.id ?? conversations[0]?.id ?? null;
  const active = conversations.find((c) => c.id === activeId) ?? null;

  const messagesQuery = useChatMessages(activeId);
  const sendMessage = useSendChatMessage(activeId);
  const markRead = useMarkChatRead();
  const formatTime = useChatTime();

  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = messagesQuery.data ?? [];

  // Reading the transcript clears the unread admin replies in it.
  //
  // Keyed on the newest message rather than on the unread count: marking read
  // invalidates the conversation list, so keying on the count would fire the
  // same request again on every refetch until the new count landed. A genuinely
  // new admin reply changes the last message id and marks read again.
  const markedThrough = useRef<string | null>(null);
  const unreadHere = active?.unreadCount ?? 0;
  const lastMessageId = active?.lastMessage?.id ?? null;
  const markReadMutate = markRead.mutate;

  useEffect(() => {
    if (!activeId || unreadHere === 0) return;
    if (markedThrough.current === lastMessageId) return;
    markedThrough.current = lastMessageId;
    markReadMutate(activeId);
  }, [activeId, unreadHere, lastMessageId, markReadMutate]);

  const select = useCallback((id: string) => {
    markedThrough.current = null;
    setSelectedId(id);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeId]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || !activeId || sendMessage.isPending) return;
    setText("");
    sendMessage.mutate(value, { onError: () => setText(value) });
  }

  if (conversationsQuery.isPending) {
    return (
      <div className="border border-border rounded bg-card p-12 flex justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (conversationsQuery.isError) {
    return (
      <ErrorPanel
        message={errorMessage(conversationsQuery.error, "We couldn't load your messages")}
        onRetry={() => void conversationsQuery.refetch()}
      />
    );
  }

  if (conversations.length === 0) {
    return (
      <div>
        <h2 className="font-display text-2xl">Messages</h2>
        <div className="mt-6 border border-border rounded bg-card p-12 text-center">
          <MessageCircle className="size-12 mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">
            You have no conversations yet. Start one and our team will reply here.
          </p>
          <Button
            onClick={() => startConversation.mutate()}
            disabled={startConversation.isPending}
            className="mt-6 uppercase tracking-[0.2em] text-xs"
          >
            {startConversation.isPending ? "Starting…" : "Start a conversation"}
          </Button>
          {startConversation.isError && (
            <p className="mt-3 text-xs text-destructive">
              {errorMessage(startConversation.error, "Could not start a conversation")}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-2xl">Messages</h2>

      <div className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* On small screens the list and the transcript swap places rather
            than competing for width. */}
        <ul className={`space-y-2 ${selectedId ? "hidden lg:block" : "block"}`}>
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeId;
            return (
              <li key={conversation.id}>
                <button
                  onClick={() => select(conversation.id)}
                  className={`w-full text-left border rounded p-3 transition-colors ${
                    isActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-primary">
                      Vielinea Support
                    </span>
                    {conversation.unreadCount > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                        {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                    {conversation.lastMessage?.message ?? "No messages yet"}
                  </p>
                  <p className="mt-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    {formatTime(conversation.lastMessageAt)}
                    {conversation.status === "closed" && " · Closed"}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <section
          className={`border border-border rounded bg-card flex flex-col h-[26rem] sm:h-[32rem] ${
            selectedId ? "block" : "hidden lg:flex"
          }`}
        >
          <header className="px-4 py-3 border-b border-border flex items-center gap-3">
            <button
              onClick={() => setSelectedId(null)}
              className="lg:hidden text-muted-foreground hover:text-primary"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div>
              <p className="font-display text-base leading-tight">Vielinea Support</p>
              <p className="text-[11px] text-muted-foreground">
                {active?.status === "closed"
                  ? "Conversation closed"
                  : "We usually reply within a few minutes"}
              </p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messagesQuery.isPending ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : messagesQuery.isError ? (
              <ErrorPanel
                message={errorMessage(messagesQuery.error, "We couldn't load this conversation")}
                onRetry={() => void messagesQuery.refetch()}
              />
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center pt-8">
                Ask us anything — sizing, delivery, returns.
              </p>
            ) : (
              messages.map((message) => {
                const mine = message.senderRole === "customer";
                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div className="max-w-[80%]">
                      <div
                        className={`px-3 py-2 rounded-lg text-sm ${
                          mine
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground"
                        }`}
                      >
                        {message.message}
                      </div>
                      <div
                        className={`text-[10px] text-muted-foreground mt-1 ${
                          mine ? "text-right" : "text-left"
                        }`}
                      >
                        {formatTime(message.createdAt)}
                        {/* Read state, from the database: for your own message
                            it says whether the team has seen it. */}
                        {mine && (message.isRead ? " · Read" : " · Sent")}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={submit} className="p-3 border-t border-border flex gap-2">
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                active?.status === "closed" ? "This conversation is closed" : "Type a message…"
              }
              maxLength={2000}
              disabled={!activeId || active?.status === "closed"}
              aria-label="Message"
            />
            <Button
              type="submit"
              disabled={
                !activeId || !text.trim() || sendMessage.isPending || active?.status === "closed"
              }
              aria-label="Send message"
            >
              {sendMessage.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
