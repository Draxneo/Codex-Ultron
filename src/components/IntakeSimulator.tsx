import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageCircle, RotateCcw, Send, Bot, User, Bug, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Message {
  role: "customer" | "jarvis";
  text: string;
  timestamp: Date;
  trace?: string[];
}

interface SessionState {
  current_step: string;
  collected_data: Record<string, any>;
}

export function IntakeSimulator() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [traceOpen, setTraceOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const allTraces = messages.flatMap((m) => m.trace || []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "customer", text, timestamp: new Date() }]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("simulate-intake", {
        body: { action: "send", message: text },
      });

      if (error) throw error;

      if (data?.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "jarvis", text: data.reply, timestamp: new Date(), trace: data.trace || [] },
        ]);
      }
      if (data?.session) {
        setSession(data.session);
      }
    } catch (e: any) {
      toast.error("Simulator error: " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const resetSession = async () => {
    setLoading(true);
    try {
      await supabase.functions.invoke("simulate-intake", {
        body: { action: "reset" },
      });
      setMessages([]);
      setSession(null);
      toast.success("Session reset — start a new conversation");
    } catch (e: any) {
      toast.error("Reset failed: " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const stepLabel = session?.current_step || "idle";
  const stepColor =
    stepLabel === "complete" ? "default" :
    stepLabel === "idle" ? "secondary" :
    "outline";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" /> Intake Simulator
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Test the SMS intake flow without sending real messages. Uses a fake phone number.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={stepColor as any} className="text-[10px]">
              {stepLabel}
            </Badge>
            <Button size="sm" variant="ghost" onClick={resetSession} disabled={loading} className="h-7 text-xs gap-1">
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Collected data summary */}
        {session?.collected_data && Object.keys(session.collected_data).length > 0 && (
          <div className="rounded-lg border border-muted bg-muted/30 p-2">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Collected Data</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(session.collected_data).map(([key, val]) => (
                <Badge key={key} variant="secondary" className="text-[9px] font-mono">
                  {key}: {typeof val === "string" ? val.slice(0, 30) : JSON.stringify(val).slice(0, 30)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Chat area */}
        <ScrollArea className="h-[300px] rounded-lg border bg-background p-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bot className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-xs">Send a message to start the intake flow</p>
              <p className="text-[10px] mt-1">Try: "My AC isn't cooling" or "I need a new system quote"</p>
            </div>
          )}
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "customer" ? "justify-end" : "justify-start"}`}>
                {msg.role === "jarvis" && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div className={`rounded-lg px-3 py-2 max-w-[80%] text-xs ${
                  msg.role === "customer"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}>
                  {msg.text}
                </div>
                {msg.role === "customer" && (
                  <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="h-3 w-3 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-3 w-3 text-primary animate-pulse" />
                </div>
                <div className="rounded-lg px-3 py-2 bg-muted text-xs text-muted-foreground">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") sendMessage(); }}
            placeholder="Type a customer message..."
            className="text-xs h-9"
            disabled={loading}
          />
          <Button size="sm" onClick={sendMessage} disabled={loading || !input.trim()} className="h-9 gap-1">
            <Send className="h-3 w-3" /> Send
          </Button>
        </div>

        {/* Debug Trace Panel */}
        {allTraces.length > 0 && (
          <Collapsible open={traceOpen} onOpenChange={setTraceOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
                <Bug className="h-3 w-3" />
                Debug Trace ({allTraces.length} entries)
                <ChevronDown className={`h-3 w-3 transition-transform ${traceOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="rounded-lg border border-muted bg-card p-2 space-y-0.5 max-h-[160px] overflow-y-auto">
                {allTraces.map((entry, i) => {
                  const isSuccess = entry.startsWith("✅");
                  const isWarning = entry.startsWith("⚠️");
                  const isError = entry.startsWith("❌");
                  const colorClass = isSuccess
                    ? "text-[hsl(var(--complete))]"
                    : isWarning
                    ? "text-[hsl(var(--warning))]"
                    : isError
                    ? "text-destructive"
                    : "text-muted-foreground";
                  return (
                    <p key={i} className={`text-[10px] font-mono leading-relaxed ${colorClass}`}>
                      {entry}
                    </p>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
