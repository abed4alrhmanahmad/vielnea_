/**
 * Live chat widget, for signed-in customers and visitors alike.
 *
 * Backed entirely by the Express API and Supabase; there is no seeded thread
 * and no localStorage transcript. The conversation, its history, timestamps and
 * unread state all come from the database, so a refresh resumes exactly where
 * the customer left off. Admin replies arrive over the SSE push stream.
 *
 * No sign-in is required. A visitor is given a server-assigned anonymous
 * identity ("Anonymous 17") and a token that resumes the same thread on the
 * next visit; the browser stores that token and nothing else. A signed-in
 * customer keeps the existing authenticated chat exactly as it was.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/contexts/store-context";
import {
  useChatConversations,
  useChatMessages,
  useChatStream,
  useChatTime,
  useChatUnread,
  useMarkChatRead,
  useOpenConversation,
  useSendChatMessage,
  useStartConversation,
} from "@/services/chat";
import {
  useGuestChatStream,
  useGuestConversation,
  useGuestMarkRead,
  useGuestMessages,
  useGuestSendMessage,
} from "@/services/chat-guest";

/**
 * Phones get the chat as a full-screen sheet sized to the *visual* viewport —
 * the part not covered by the on-screen keyboard. iOS Safari does not shrink
 * the layout viewport when the keyboard opens, so a panel anchored to the
 * bottom of the page would sit behind the keyboard; tracking visualViewport
 * keeps the header on screen and the input just above the keyboard on iOS and
 * Android alike. Short landscape screens count as phones too.
 */
const SHEET_QUERY = "(max-width: 639px), (max-height: 500px)";

function useChatSheet(open: boolean) {
  const [isSheet, setIsSheet] = useState(false);
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const media = window.matchMedia(SHEET_QUERY);
    const update = () => setIsSheet(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || !isSheet) return;
    const vv = window.visualViewport;
    const update = () =>
      setViewport(
        vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight },
      );
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    // The sheet covers the page; stop the page behind it from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, isSheet]);

  return { isSheet, viewport };
}

export function ChatWidget() {
  const { isAuthenticated } = useStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isSheet, viewport } = useChatSheet(open);

  // Two identities, one widget. A signed-in customer keeps the existing
  // authenticated chat untouched; a visitor uses the guest endpoints, where
  // the server assigns "Anonymous N" and no personal detail is ever asked for.
  const isGuest = !isAuthenticated;

  const authConnected = useChatStream(isAuthenticated);
  const conversationsQuery = useChatConversations(isAuthenticated);
  const authConversation = useOpenConversation(conversationsQuery.data);
  const authConversationId = authConversation?.id ?? null;
  // Gated on isAuthenticated, not just on having an id: a stale
  // conversationId can otherwise linger in the query cache after logout (the
  // query is merely paused, not cleared) and this hook would fire against the
  // authenticated endpoint with no session, producing a 401 that has nothing
  // to do with the guest who is actually using the widget.
  const authMessagesQuery = useChatMessages(isAuthenticated ? authConversationId : null);
  const unreadQuery = useChatUnread(isAuthenticated);
  const startConversation = useStartConversation();
  const authSendMessage = useSendChatMessage(authConversationId);
  const authMarkRead = useMarkChatRead();

  // The guest thread is created lazily: only once the panel is actually
  // opened, so simply loading the site never creates an "Anonymous N".
  const guestQuery = useGuestConversation(isGuest && open);
  const guestConversationId = guestQuery.data?.conversation.id ?? null;
  const guestMessagesQuery = useGuestMessages(isGuest ? guestConversationId : null);
  const guestConnected = useGuestChatStream(isGuest ? guestConversationId : null);
  const guestSendMessage = useGuestSendMessage(guestConversationId);
  const guestMarkRead = useGuestMarkRead();

  const formatTime = useChatTime();

  const connected = isGuest ? guestConnected : authConnected;
  const conversationId = isGuest ? guestConversationId : authConversationId;
  const messagesQuery = isGuest ? guestMessagesQuery : authMessagesQuery;
  const sendMessage = isGuest ? guestSendMessage : authSendMessage;
  const markRead = isGuest ? guestMarkRead : authMarkRead;

  const messages = messagesQuery.data ?? [];
  const unread = isGuest
    ? messages.filter((m) => m.senderRole === "admin" && !m.isRead).length
    : (unreadQuery.data?.unread ?? 0);

  // Opening the panel with no conversation yet creates one. The endpoint is
  // idempotent, so this cannot produce duplicate threads.
  useEffect(() => {
    if (
      open &&
      isAuthenticated &&
      conversationsQuery.isSuccess &&
      !authConversation &&
      !startConversation.isPending
    ) {
      startConversation.mutate();
    }
  }, [open, isAuthenticated, conversationsQuery.isSuccess, authConversation, startConversation]);

  // Seeing the transcript marks the admin's messages read.
  useEffect(() => {
    if (open && conversationId && unread > 0 && !markRead.isPending) {
      markRead.mutate(conversationId);
    }
  }, [open, conversationId, unread, markRead]);

  // Keep the newest message in view: on new messages, and when the keyboard
  // opening or closing resizes the sheet.
  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, open, viewport?.height]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || !conversationId || sendMessage.isPending) return;
    setText("");
    sendMessage.mutate(value, {
      onError: () => setText(value),
    });
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={isSheet && viewport ? { top: viewport.top, height: viewport.height } : undefined}
            className={`fixed z-50 flex flex-col bg-card overflow-hidden ${
              isSheet
                ? "inset-x-0 top-0 h-dvh w-full"
                : "bottom-24 right-6 w-[min(22rem,calc(100vw-3rem))] h-[min(28rem,calc(100dvh-8rem))] border border-border rounded shadow-xl"
            }`}
            role="dialog"
            aria-label="Live chat with Vielinea support"
          >
            <div className="shrink-0 px-4 py-3 bg-primary text-primary-foreground flex items-center justify-between">
              <div>
                <div className="font-display text-base leading-tight">Vielinea Support</div>
                <div className="text-[11px] opacity-80 flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${connected ? "bg-green-400" : "bg-white/40"}`}
                  />
                  {connected ? "Connected" : "Reconnecting…"}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="-mr-2 p-2 opacity-80 hover:opacity-100 transition-opacity"
              >
                <X className={isSheet ? "size-5" : "size-4"} />
              </button>
            </div>

            {guestQuery.isError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Chat is unavailable right now. Please try again in a moment.
                </p>
              </div>
            ) : (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3"
                >
                  {messagesQuery.isLoading ||
                  startConversation.isPending ||
                  guestQuery.isLoading ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <Loader2 className="size-5 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center pt-8">
                      Ask us anything — sizing, delivery, returns. We usually reply within a few
                      minutes.
                    </p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.senderRole === "customer" ? "justify-end" : "justify-start"}`}
                      >
                        <div className="max-w-[80%] min-w-0">
                          <div
                            className={`px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                              message.senderRole === "customer"
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-foreground"
                            }`}
                          >
                            {message.message}
                          </div>
                          <div
                            className={`text-[10px] text-muted-foreground mt-1 ${
                              message.senderRole === "customer" ? "text-right" : "text-left"
                            }`}
                          >
                            {formatTime(message.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {sendMessage.isPending && (
                    <div className="flex justify-end">
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" />
                        Sending…
                      </div>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={submit}
                  className="shrink-0 p-3 border-t border-border flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                  <Input
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Type a message…"
                    maxLength={2000}
                    disabled={!conversationId}
                    aria-label="Message"
                  />
                  <Button
                    type="submit"
                    disabled={!conversationId || !text.trim() || sendMessage.isPending}
                    aria-label="Send message"
                  >
                    <Send className="size-4" />
                  </Button>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* On phones the open sheet has its own close button; the launcher would
          otherwise sit on top of the message input. */}
      <button
        aria-label={open ? "Close chat" : "Open chat"}
        onClick={() => setOpen((value) => !value)}
        className={`fixed bottom-6 right-6 z-50 items-center justify-center size-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary-dark transition-colors ${
          open && isSheet ? "hidden" : "flex"
        }`}
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-medium flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
