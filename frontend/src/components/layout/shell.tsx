import type { CSSProperties, ReactNode } from "react";
import { Header } from "./header";
import { Footer } from "./footer";
import { ChatWidget } from "@/components/chat/chat-widget";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      {/* Page-content entrance. Identical fade-and-rise (8px over 400ms,
          ease-out) to the Framer Motion version this replaces — moved to CSS
          because the JS-driven one server-rendered <main> at opacity:0, which
          left every page's content, and its LCP element, invisible until the
          bundle had downloaded and hydrated. */}
      <main
        style={{ "--enter-from": "8px", "--enter-duration": "400ms" } as CSSProperties}
        className="enter-rise motion-reduce:animate-none flex-1"
      >
        {children}
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
}
