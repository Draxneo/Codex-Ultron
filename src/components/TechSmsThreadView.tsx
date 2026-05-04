/**
 * TechSmsThreadView — Displays SMS thread for a technician in Team HQ.
 *
 * Renders incoming/outbound messages, marks as read, and provides a composer
 * with BU selection. Reuses existing SMS rendering and send logic.
 */
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/formatters";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { getSmsThreadKey } from "@/hooks/useSmsLog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SmsMessage {
  id: string;
  phone_number: string;
  direction: "inbound" | "outbound";
  body: string;
  is_read: boolean;
  created_at: string;
}

interface TechSmsThreadViewProps {
  techId: string;
  techPhone: string;
  techName: string;
  businessUnitId: string | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

export function TechSmsThreadView({
  techId,
  techPhone,
  techName,
  businessUnitId,
}: TechSmsThreadViewProps) {
  const { sendSms, markAsRead } = useSmsLogScoped();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Fetch SMS messages for this tech's phone.
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["tech-sms-thread-messages", techId, techPhone],
    queryFn: async () => {
      const phoneVariants = [
        `+1${techPhone.replace(/\D/g, "").slice(-10)}`,
        techPhone.replace(/\D/g, "").slice(-10),
        techPhone,
      ];

      const { data, error } = await supabase
        .from("v_sms_log_with_day")
        .select("id, phone_number, direction, body, is_read, created_at")
        .in("phone_number", phoneVariants)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as SmsMessage[];
    },
    staleTime: 5_000,
  });

  // Mark inbound messages as read.
  useEffect(() => {
    const threadKey = getSmsThreadKey(techPhone);
    void markAsRead(threadKey);
  }, [techPhone, markAsRead]);

  // Auto-scroll to bottom.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!body.trim()) return;

    setSending(true);
    try {
      const success = await sendSms(
        techPhone,
        body,
        undefined,
        techName,
        [],
        { businessUnitId: businessUnitId || undefined }
      );
      if (success) {
        setBody("");
      }
    } catch (err) {
      console.error("Failed to send SMS:", err);
      toast.error("Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="flex min-h-[200px] items-center justify-center text-center text-muted-foreground">
              <p className="text-sm">
                No messages yet. Start the conversation.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className={cn("flex gap-2", isOutbound && "flex-row-reverse")}
              >
                {!isOutbound && (
                  <Avatar className="h-7 w-7 shrink-0 mt-1">
                    <AvatarFallback className="text-xs">
                      {initials(techName)}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={cn(
                    "max-w-xs rounded-lg px-3 py-2 text-sm",
                    isOutbound
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">{msg.body}</p>
                  <p
                    className={cn(
                      "mt-1 text-xs opacity-70",
                      isOutbound
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {formatDistanceToNow(new Date(msg.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>

                {isOutbound && (
                  <div className="mt-1">
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* Composer */}
      <footer className="border-t bg-card/90 p-3">
        <div className="space-y-2">
          <Textarea
            placeholder="Type a message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
            className="min-h-20 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                handleSend();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBody("")}
              disabled={!body.trim() || sending}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!body.trim() || sending}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending
                </>
              ) : (
                "Send"
              )}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
