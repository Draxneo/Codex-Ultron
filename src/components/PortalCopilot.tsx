import { useState, useRef, useCallback, useEffect } from "react";
import { MessageSquare, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-customer-chat`;

export function PortalCopilot({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Show greeting bubble once per session
  useEffect(() => {
    if (sessionStorage.getItem("portal_greeted")) return;
    const show = setTimeout(() => setShowGreeting(true), 2000);
    const hide = setTimeout(() => {
      setShowGreeting(false);
      sessionStorage.setItem("portal_greeted", "1");
    }, 7000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setShowGreeting(false);
    sessionStorage.setItem("portal_greeted", "1");
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMsg: Msg = { role: "user", content: text };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput("");
    setIsStreaming(true);

    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMsgs, customer_id: customerId }),
      });

      if (!resp.ok || !resp.body) {
        const errorData = await resp.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${errorData.error || "Something went wrong"}` }]);
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error("Portal chat error:", e);
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Failed to connect. Please try again." }]);
    }
    setIsStreaming(false);
  }, [input, messages, isStreaming, customerId]);

  if (!open) {
    return (
      <div className="fixed bottom-5 right-5 z-50 flex items-end gap-2">
        {showGreeting && (
          <div className="animate-in slide-in-from-right-4 fade-in duration-500 mb-1 bg-white rounded-xl shadow-lg border px-4 py-3 max-w-[200px] relative">
            <button
              onClick={() => { setShowGreeting(false); sessionStorage.setItem("portal_greeted", "1"); }}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 text-xs"
            >
              ×
            </button>
            <p className="text-sm font-medium text-gray-800">Hi! 👋</p>
            <p className="text-xs text-gray-500 mt-0.5">Need some help? Ask me anything about your account.</p>
            <div className="absolute right-[-6px] bottom-4 w-3 h-3 bg-white border-r border-b rotate-[-45deg]" />
          </div>
        )}
        <button
          onClick={handleOpen}
          className="h-12 w-12 rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform bg-[hsl(213,55%,22%)] text-white"
          aria-label="Open Help Chat"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 w-full sm:w-[360px] sm:bottom-5 sm:right-5 flex flex-col border rounded-t-xl sm:rounded-xl shadow-2xl max-h-[70vh] sm:max-h-[500px] bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b rounded-t-xl bg-gradient-to-r from-[hsl(213,60%,14%)] to-[hsl(213,55%,22%)]">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[hsl(35,92%,52%)]" />
          <span className="text-sm font-semibold text-white">Help & Support</span>
        </div>
        <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded text-white/70 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8 space-y-2">
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p>Ask about your jobs, equipment, invoices, or maintenance plan.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap",
              msg.role === "user"
                ? "bg-[hsl(213,55%,22%)] text-white"
                : "bg-gray-100 text-gray-900"
            )}>
              {msg.content}
            </div>
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-2">
        <form onSubmit={e => { e.preventDefault(); send(); }} className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isStreaming}
            className="flex-1 min-h-[44px] rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(213,55%,40%)]"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming}
            className="h-[44px] w-[44px] shrink-0 bg-[hsl(213,55%,22%)] hover:bg-[hsl(213,45%,32%)]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
