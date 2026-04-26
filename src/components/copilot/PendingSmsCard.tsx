/**
 * PendingSmsCard — Inline HITL approval for pending outbound SMS drafts.
 * Replaces the standalone SMS Outbox UI. Renders one card per pending SMS
 * directly in the JARVIS Now panel.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Loader2, Send, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

interface PendingDraft {
  id: string;
  recipient: string;
  body: string;
  source: string | null;
  job_id: string | null;
  created_at: string;
}

export function PendingSmsCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [actionId, setActionId] = useState<string | null>(null);

  const { data: drafts = [] } = useQuery({
    queryKey: ["pending_sms_drafts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_drafts")
        .select("id, recipient, body, source, job_id, created_at")
        .eq("channel", "sms")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PendingDraft[];
    },
    refetchInterval: 30_000,
  });

  useRealtimeInvalidation(
    [{ table: "outbound_drafts", queryKeys: [["pending_sms_drafts"]] }],
    "rt-pending-sms-drafts"
  );

  if (drafts.length === 0) return null;

  const handleSend = async (draft: PendingDraft) => {
    setActionId(draft.id);
    try {
      await supabase.from("outbound_drafts").update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
      }).eq("id", draft.id);

      const { sendSmsImpl } = await import("@/hooks/useSendSms");
      const result = await sendSmsImpl({
        to: draft.recipient,
        body: draft.body,
        jobId: draft.job_id,
        source: draft.source || "pending_sms_card",
        hitlApproved: true,
        silent: true,
      });
      if (!result.success) throw new Error(result.error || "Send failed");

      toast({ title: "SMS sent" });
      qc.invalidateQueries({ queryKey: ["pending_sms_drafts"] });
      qc.invalidateQueries({ queryKey: ["outbound_drafts"] });
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    }
    setActionId(null);
  };

  const handleDismiss = async (draft: PendingDraft) => {
    setActionId(draft.id);
    try {
      await supabase.from("outbound_drafts").update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
      }).eq("id", draft.id);
      qc.invalidateQueries({ queryKey: ["pending_sms_drafts"] });
      qc.invalidateQueries({ queryKey: ["outbound_drafts"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setActionId(null);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Pending SMS ({drafts.length})
      </p>
      {drafts.map((d) => (
        <div
          key={d.id}
          className="rounded-lg border-2 border-[hsl(var(--complete))]/30 bg-[hsl(var(--complete))]/5 p-3 space-y-2"
        >
          <div className="flex items-start gap-2">
            <div className="rounded-full bg-[hsl(var(--complete))]/10 p-1.5">
              <MessageCircle className="h-4 w-4 text-[hsl(var(--complete))]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold truncate">{d.recipient}</p>
                {d.source && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                    {d.source}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1 whitespace-pre-wrap break-words">
                {d.body}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSend(d)}
              disabled={actionId === d.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-[hsl(var(--complete))] text-primary-foreground text-xs font-medium px-3 py-1.5 hover:opacity-90 transition disabled:opacity-50"
            >
              {actionId === d.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Send
            </button>
            <button
              onClick={() => handleDismiss(d)}
              disabled={actionId === d.id}
              className="inline-flex items-center justify-center gap-1 rounded-md border bg-background text-xs font-medium px-3 py-1.5 hover:bg-muted transition disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
