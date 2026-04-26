/**
 * ActionItemCards — JARVIS decision queue review panel.
 * Shows pending action_items with Accept / Dismiss controls.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { useBookingAction } from "@/hooks/useBookingAction";
import { format } from "date-fns";
import {
  ChevronLeft, Loader2, Check, X, MapPin, UserCheck,
  CalendarPlus, MessageCircle, Eye, AlertTriangle, Bot,
  PhoneMissed, Phone, MessageSquare, CheckCircle2, Brain, Send, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { TrainContactDialog } from "@/components/jarvis/TrainContactDialog";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  new_appointment:  { label: "New Job",  icon: CalendarPlus,  color: "text-green-500" },
  missed_call:      { label: "Missed",   icon: PhoneMissed,   color: "text-red-500" },
  address_verify:   { label: "Address",   icon: MapPin,        color: "text-orange-500" },
  name_verify:      { label: "Name",      icon: UserCheck,     color: "text-amber-500" },
  booking_confirm:  { label: "Booking",   icon: CalendarPlus,  color: "text-blue-500" },
  thread_attention: { label: "Thread",    icon: MessageCircle, color: "text-violet-500" },
  permit_needed:    { label: "Permit",    icon: AlertTriangle, color: "text-red-500" },
  general:          { label: "General",   icon: Bot,           color: "text-muted-foreground" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high:     "bg-amber-500/10 text-amber-600 border-amber-500/30",
  normal:   "bg-muted text-muted-foreground border-border",
  low:      "bg-muted/50 text-muted-foreground/70 border-border/50",
};

export function ActionItemCards({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const softphone = useSoftphoneContext();
  const telephony = useTelephonyMode();
  const { book, getState } = useBookingAction();
  const [actionId, setActionId] = useState<string | null>(null);
  const [trainPhone, setTrainPhone] = useState<{ phone: string; name?: string } | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);

  const handleDraftReply = async (item: any) => {
    setDraftingId(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("draft-sms-reply", {
        body: { action_item_id: item.id },
      });
      if (error) throw error;
      const reply = data?.reply || "";
      if (!reply) throw new Error("AI returned an empty reply");
      setReplyDrafts((d) => ({ ...d, [item.id]: reply }));
    } catch (e: any) {
      toast({ title: "Draft failed", description: e.message, variant: "destructive" });
    }
    setDraftingId(null);
  };

  const handleSendReply = async (item: any) => {
    const phone = (item.metadata as any)?.phone || item.customer_phone;
    const draft = (replyDrafts[item.id] ?? (item.metadata as any)?.suggested_reply ?? "").trim();
    if (!phone || !draft) {
      toast({ title: "Nothing to send", description: "Reply is empty — tap 'Draft with AI' or type one.", variant: "destructive" });
      return;
    }
    setSendingId(item.id);
    try {
      const { sendSmsImpl } = await import("@/hooks/useSendSms");
      const result = await sendSmsImpl({
        to: phone, body: draft, jobId: item.job_id || null,
        source: "action_item_reply", hitlApproved: true, silent: true,
      });
      if (!result.success) throw new Error(result.error || "Send failed");
      await supabase.from("action_items" as any).update({
        status: "accepted",
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id || null,
      }).eq("id", item.id);
      toast({ title: "Reply sent", description: draft.slice(0, 80) });
      qc.invalidateQueries({ queryKey: ["action_items_pending"] });
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    }
    setSendingId(null);
  };

  const { data: items, isLoading } = useQuery({
    queryKey: ["action_items_pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_items" as any)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const handleAction = async (item: any, status: "accepted" | "dismissed") => {
    setActionId(item.id);
    try {
      // HCP-first booking via shared helper
      if (status === "accepted" && item.category === "new_appointment" && item.metadata) {
        const result = await book({
          action_item_id: item.id,
          metadata: item.metadata,
          description: item.description,
          customer_phone: item.customer_phone,
        });
        setActionId(null);
        if (result.ok) {
          qc.invalidateQueries({ queryKey: ["action_items_pending"] });
          qc.invalidateQueries({ queryKey: ["jobs"] });
          qc.invalidateQueries({ queryKey: ["dispatch-jobs"] });
        }
        return;
      }

      // Default: just mark as accepted/dismissed
      await supabase.from("action_items" as any).update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id || null,
      }).eq("id", item.id);

      await supabase.from("activity_log").insert({
        action: `action_item_${status}`,
        details: `${item.title} — ${status}`,
        job_id: item.job_id || null,
      });

      toast({
        title: status === "accepted" ? "Accepted" : "Dismissed",
        description: item.title,
      });

      qc.invalidateQueries({ queryKey: ["action_items_pending"] });

    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setActionId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const catMeta = (cat: string) => CATEGORY_META[cat] || CATEGORY_META.general;

  return (
    <div className="flex flex-col gap-2 p-2">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
      >
        <ChevronLeft className="h-3 w-3" /> Back to Now
      </button>

      {(!items || items.length === 0) ? (
        <p className="text-sm text-muted-foreground text-center py-4">No pending action items.</p>
      ) : (
        items.map((item: any) => {
          const meta = catMeta(item.category);
          const Icon = meta.icon;
          const priorityClass = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal;

          return (
            <div key={item.id} className={`rounded-lg border p-3 space-y-2 ${priorityClass}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${meta.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{item.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(item.created_at), "h:mm a")}
                  </span>
                </div>
              </div>

              {/* Inbound message preview (thread_attention) */}
              {item.category === "thread_attention" && (item.metadata as any)?.inbound_message && (
                <div className="rounded border border-border/50 bg-background/50 px-2 py-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">They said</p>
                  <p className="text-xs italic">"{(item.metadata as any).inbound_message}"</p>
                </div>
              )}

              {item.suggested_action && item.category !== "thread_attention" && (
                <div className="rounded bg-muted/50 px-2 py-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Suggested</p>
                  <p className="text-xs">{item.suggested_action}</p>
                </div>
              )}

              {/* Editable suggested reply (thread_attention) */}
              {item.category === "thread_attention" && (() => {
                const currentDraft = replyDrafts[item.id] ?? (item.metadata as any)?.suggested_reply ?? "";
                const hasDraft = currentDraft.trim().length > 0;
                const isDrafting = draftingId === item.id;
                const isSending = sendingId === item.id;
                return (
                  <div className="rounded border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium text-primary">
                        {hasDraft ? "Reply to customer (edit, then send)" : "No reply drafted yet"}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => handleDraftReply(item)}
                        disabled={isDrafting || isSending}
                      >
                        {isDrafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {hasDraft ? "Re-draft with AI" : "Draft with AI"}
                      </Button>
                    </div>
                    <Textarea
                      value={currentDraft}
                      onChange={(e) => setReplyDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                      placeholder="Tap 'Draft with AI' to generate a reply, or type your own…"
                      className="min-h-[60px] text-xs bg-background"
                      disabled={isSending || isDrafting}
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleSendReply(item)}
                      disabled={isSending || isDrafting || actionId === item.id || !hasDraft}
                    >
                      {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Send Reply to Customer
                    </Button>
                  </div>
                );
              })()}

              {item.source && item.source !== "jarvis" && (
                <p className="text-[10px] text-muted-foreground">Source: {item.source}</p>
              )}

              {(() => {
                const bs = getState(item.id);
                if (bs.phase === "failed" && bs.error) {
                  return (
                    <div className="flex items-start gap-1.5 rounded border border-destructive/40 bg-destructive/10 p-1.5 text-[10px] text-destructive">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="break-words">{bs.error}</span>
                    </div>
                  );
                }
                if ((bs.phase === "syncing" || bs.phase === "booked") && bs.result) {
                  return (
                    <div className="flex items-center gap-1.5 rounded border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 p-1.5 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-[hsl(var(--success))]" />
                      <span className="text-foreground font-medium">
                        #{bs.result.hcp_job_number || bs.result.hcp_estimate_number || bs.result.hcp_id}
                      </span>
                      <span className="text-muted-foreground">
                        {bs.phase === "syncing" ? "syncing to board…" : "booked"}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {(() => {
                const trainablePhone =
                  (item.metadata as any)?.phone || item.customer_phone;
                const isTrainable =
                  !!trainablePhone &&
                  ["new_lead", "missed_call", "thread_attention"].includes(item.category);

                if (item.category === "missed_call") {
                  return (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          const phone = (item.metadata as any)?.phone || item.customer_phone;
                          if (phone) {
                            // Always use the in-app popup dialer (SoftphoneStrip)
                            softphone.setDialNumber(phone);
                          }
                          handleAction(item, "accepted");
                        }}
                        disabled={actionId === item.id}
                      >
                        <Phone className="h-3 w-3" /> Call Back
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          const phone = (item.metadata as any)?.phone || item.customer_phone;
                          if (phone) {
                            navigate(`/inbox?section=sms&phone=${encodeURIComponent(phone)}`);
                          }
                          handleAction(item, "accepted");
                        }}
                        disabled={actionId === item.id}
                      >
                        <MessageSquare className="h-3 w-3" /> Text
                      </Button>
                      {isTrainable && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Train JARVIS who this is"
                          onClick={() => setTrainPhone({ phone: trainablePhone, name: (item.metadata as any)?.customer_name })}
                          disabled={actionId === item.id}
                        >
                          <Brain className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(item, "dismissed")}
                        disabled={actionId === item.id}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                }

                const bs = getState(item.id);
                const isWorking = bs.phase === "resolving" || bs.phase === "booking" || bs.phase === "syncing";
                const isBookingItem = item.category === "new_appointment";
                return (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleAction(item, "accepted")}
                      disabled={actionId === item.id || isWorking}
                    >
                      {(actionId === item.id || isWorking) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      {isBookingItem
                        ? (bs.phase === "resolving" ? "Resolving…"
                          : bs.phase === "booking" ? "Booking in HCP…"
                          : bs.phase === "syncing" ? "Syncing…"
                          : bs.phase === "booked" ? "Booked"
                          : bs.phase === "failed" ? "Retry Booking"
                          : "Accept & Book")
                        : "Accept"}
                    </Button>
                    {isTrainable && (
                      <Button
                        size="sm"
                        variant="outline"
                        title="Train JARVIS who this is"
                        onClick={() => setTrainPhone({ phone: trainablePhone, name: (item.metadata as any)?.customer_name })}
                        disabled={actionId === item.id || isWorking}
                      >
                        <Brain className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(item, "dismissed")}
                      disabled={actionId === item.id || isWorking}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })()}
            </div>
          );
        })
      )}

      {trainPhone && (
        <TrainContactDialog
          open={!!trainPhone}
          onOpenChange={(o) => !o && setTrainPhone(null)}
          phone={trainPhone.phone}
          defaultName={trainPhone.name}
        />
      )}
    </div>
  );
}
