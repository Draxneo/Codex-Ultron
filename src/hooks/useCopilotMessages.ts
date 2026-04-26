import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type SuggestedAction = {
  type: "book_job" | "book_estimate" | "book_maintenance" | "create_customer" | "call_back" | "send_text" | "reply_sms" | "reply_email" | "send_invoice_reminder" | "view_job" | "view_voicemail" | "confirm" | "confirm_no";
  job_type?: string;
  customer_name?: string;
  customer_id?: string;
  phone?: string;
  address?: string;
  description?: string;
  email?: string;
  payload?: string;
  label?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  customerPreview?: any;
  existingMatches?: any[];
  customerCreated?: boolean;
  hcpCustomer?: any;
  emergencyFeeStep?: boolean;
  emergencyFeeAccepted?: boolean;
  suggestedActions?: SuggestedAction[];
};

type DbMessage = {
  id: string;
  role: string;
  content: string;
  metadata: any;
  created_at: string;
};

function dbToChat(row: DbMessage): ChatMessage {
  return {
    role: row.role as "user" | "assistant",
    content: row.content,
    ...(row.metadata?.customerPreview && { customerPreview: row.metadata.customerPreview }),
    ...(row.metadata?.existingMatches && { existingMatches: row.metadata.existingMatches }),
    ...(row.metadata?.customerCreated && { customerCreated: row.metadata.customerCreated }),
    ...(row.metadata?.hcpCustomer && { hcpCustomer: row.metadata.hcpCustomer }),
    ...(row.metadata?.emergencyFeeStep && { emergencyFeeStep: row.metadata.emergencyFeeStep }),
    ...(row.metadata?.emergencyFeeAccepted && { emergencyFeeAccepted: row.metadata.emergencyFeeAccepted }),
    ...(row.metadata?.suggestedActions && { suggestedActions: row.metadata.suggestedActions }),
  };
}

function chatToMetadata(msg: ChatMessage): any | null {
  const meta: any = {};
  if (msg.customerPreview) meta.customerPreview = msg.customerPreview;
  if (msg.existingMatches?.length) meta.existingMatches = msg.existingMatches;
  if (msg.customerCreated) meta.customerCreated = msg.customerCreated;
  if (msg.hcpCustomer) meta.hcpCustomer = msg.hcpCustomer;
  if (msg.emergencyFeeStep) meta.emergencyFeeStep = msg.emergencyFeeStep;
  if (msg.emergencyFeeAccepted) meta.emergencyFeeAccepted = msg.emergencyFeeAccepted;
  if (msg.suggestedActions?.length) meta.suggestedActions = msg.suggestedActions;
  return Object.keys(meta).length > 0 ? meta : null;
}

export function useCopilotMessages(employeeId?: string | null, sessionId?: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Load messages scoped to session + realtime subscription
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setMessages([]);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      // If no session yet, show empty
      if (!sessionId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("copilot_messages")
        .select("*")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (!cancelled) {
        setMessages((data || []).map(dbToChat));
        setLoading(false);
      }
    };

    void load();

    // Realtime subscription for server-injected messages (e.g. post-call booking cards)
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (sessionId) {
      channel = supabase
        .channel(`copilot-msgs-${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "copilot_messages",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as DbMessage;
            // Avoid duplicating messages we already inserted client-side
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.content === row.content && lastMsg.role === row.role) {
                return prev; // likely a duplicate
              }
              return [...prev, dbToChat(row)];
            });
          }
        )
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Persist a single message to DB
  const persistMessage = useCallback(async (msg: ChatMessage) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !sessionId) return;

    await supabase.from("copilot_messages").insert({
      user_id: user.id,
      role: msg.role,
      content: msg.content,
      metadata: chatToMetadata(msg),
      session_id: sessionId,
      ...(employeeId ? { employee_id: employeeId } : {}),
    });
  }, [employeeId, sessionId]);

  // Update metadata for a message at index
  const updateMessageAt = useCallback((index: number, updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages(prev => prev.map((m, i) => i === index ? updater(m) : m));
  }, []);

  // Add messages and persist them
  const addMessages = useCallback(async (...msgs: ChatMessage[]) => {
    setMessages(prev => [...prev, ...msgs]);
    for (const msg of msgs) {
      await persistMessage(msg);
    }
  }, [persistMessage]);

  // Clear messages from UI only (data stays in DB)
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, setMessages, addMessages, updateMessageAt, clearMessages, loading, persistMessage };
}
