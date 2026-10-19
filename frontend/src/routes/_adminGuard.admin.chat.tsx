import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send } from "lucide-react";
import { PageHeader } from "@/admin/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useChatThreads, chatService } from "@/admin/services/chat";

export const Route = createFileRoute("/_adminGuard/admin/chat")({
  head: () => ({
    meta: [{ title: "Live Chat — Vielinea Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminChatPage,
});

function AdminChatPage() {
  const threads = useChatThreads();
  const [activeId, setActiveId] = useState(threads[0]?.id ?? "");
  const [text, setText] = useState("");
  const active = threads.find((t) => t.id === activeId);
  function send() {
    if (!text.trim() || !active) return;
    chatService.send(active.id, text);
    setText("");
  }
  return (
    <div>
      <PageHeader
        title="Live Chat"
        description={`${threads.reduce((s, t) => s + t.unread, 0)} unread`}
      />
      <Card className="grid grid-cols-1 md:grid-cols-[280px_1fr] h-[calc(100vh-14rem)] overflow-hidden">
        <div className="border-r border-border overflow-y-auto">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveId(t.id);
                chatService.markRead(t.id);
              }}
              className={`w-full text-left p-3 border-b border-border flex items-start gap-2 ${activeId === t.id ? "bg-secondary" : "hover:bg-secondary/50"}`}
            >
              <div
                className={`size-2 rounded-full mt-1.5 ${t.online ? "bg-green-500" : "bg-muted-foreground/40"}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <div className="text-sm font-medium truncate">
                    {t.customerName}
                    {/* A guest has no account. Saying so beside the generated
                        name is how an admin tells an anonymous visitor from a
                        customer who happens to be called something similar. */}
                    {t.isGuest && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        guest
                      </span>
                    )}
                  </div>
                  {t.unread > 0 && <Badge className="ml-2">{t.unread}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.messages[t.messages.length - 1]?.text}
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex flex-col">
          {active ? (
            <>
              <div className="p-3 border-b border-border">
                <div className="text-sm font-medium">{active.customerName}</div>
                <div className="text-xs text-muted-foreground">
                  {active.isGuest ? "Anonymous visitor — not signed in" : active.customerEmail}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {active.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.from === "admin" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${m.from === "admin" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="p-3 border-t border-border flex gap-2"
              >
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type a reply..."
                />
                <Button type="submit">
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a conversation
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
