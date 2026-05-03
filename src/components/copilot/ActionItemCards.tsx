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
import { useSharedActionItemTasks } from "@/hooks/useSharedActionItemTasks";
import { useEmployees } from "@/hooks/useEmployees";
import { format } from "date-fns";
import {
  ChevronLeft, Loader2, Check, X, MapPin, UserCheck,
  CalendarPlus, MessageCircle, Eye, AlertTriangle, Bot,
  PhoneMissed, Phone, MessageSquare, CheckCircle2, Brain, Send, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrainContactDialog } from "@/components/jarvis/TrainContactDialog";
import {
  ACTION_ITEM_STATUS,
  ACTION_ITEMS_PENDING_QUERY_KEY,
  getActionItemPhone,
  invalidateActionItemQueues,
  resolveActionItem,
  type ActionItemResolutionStatus,
} from "@/lib/actionItemLifecycle";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { APP_ACTION_GO_LIVE_ISO } from "@/lib/appLifecycle";
import { getActionOwnership } from "@/lib/actionOwnership";

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  new_appointment:  { label: "New Job",  icon: CalendarPlus,  color: "text-green-500" },
  create_customer:  { label: "Customer", icon: UserCheck,     color: "text-violet-500" },
  new_lead:         { label: "New Lead", icon: UserCheck,     color: "text-emerald-500" },
  follow_up:        { label: "Follow",   icon: MessageSquare, color: "text-sky-500" },
  missed_call:      { label: "Missed",   icon: PhoneMissed,   color: "text-red-500" },
  address_verify:   { label: "Address",   icon: MapPin,        color: "text-orange-500" },
  name_verify:      { label: "Name",      icon: UserCheck,     color: "text-amber-500" },
  booking_confirm:  { label: "Booking",   icon: CalendarPlus,  color: "text-blue-500" },
  jarvis_action_approval: { label: "Approval", icon: Brain, color: "text-violet-500" },
  thread_attention: { label: "Thread",    icon: MessageCircle, color: "text-violet-500" },
  schedule_change:  { label: "Schedule",  icon: CalendarPlus,  color: "text-amber-500" },
  eta_request:      { label: "ETA",       icon: Phone,         color: "text-blue-500" },
  access_note:      { label: "Access",    icon: MapPin,        color: "text-orange-500" },
  pet_warning:      { label: "Pet",       icon: AlertTriangle, color: "text-red-500" },
  contact_update:   { label: "Contact",   icon: Phone,         color: "text-sky-500" },
  permit_needed:    { label: "Permit",    icon: AlertTriangle, color: "text-red-500" },
  general:          { label: "General",   icon: Bot,           color: "text-muted-foreground" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high:     "bg-amber-500/10 text-amber-600 border-amber-500/30",
  normal:   "bg-muted text-muted-foreground border-border",
  low:      "bg-muted/50 text-muted-foreground/70 border-border/50",
};

const TIME_BLOCKS = [
  { label: "8 to 10", start: "08:00", end: "10:00" },
  { label: "10 to 12", start: "10:00", end: "12:00" },
  { label: "12 to 2", start: "12:00", end: "14:00" },
  { label: "2 to 4", start: "14:00", end: "16:00" },
  { label: "4 to 6", start: "16:00", end: "18:00" },
];

function isScheduleableActionItem(item: any) {
  const ownership = getActionOwnership(item);
  if (ownership.requiresSchedule && item?.category !== "new_appointment") return true;
  const meta = (item?.metadata || {}) as Record<string, any>;
  if (item.category === "new_appointment") return false;
  if (meta.needs_schedule_before_accept) return true;
  if (meta.follow_up_date || meta.scheduled_date) return true;
  const haystack = [
    item.category,
    item.title,
    item.description,
    item.suggested_action,
    meta.jarvis_intent,
    meta.quote_subject,
    meta.workflow_type,
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(quote|bid|estimate|follow[-\s]?up|callback|call back)\b/.test(haystack);
}

function defaultScheduleForm(item: any, employees: any[] = []) {
  const meta = (item?.metadata || {}) as Record<string, any>;
  const defaultDate = meta.follow_up_date || meta.scheduled_date || new Date().toISOString().slice(0, 10);
  const requested = String(meta.scheduled_time || "").toLowerCase();
  const defaultBlock =
    TIME_BLOCKS.find((block) => block.start === meta.scheduled_time || block.label === requested) ||
    (requested.includes("morning") ? TIME_BLOCKS[0] : TIME_BLOCKS[0]);
  const defaultEmployee =
    meta.assigned_to ||
    ((meta.business_unit_name || meta.company_label || "").toLowerCase().includes("fix")
      ? "Clint Carnes"
      : meta.job_type === "service"
        ? "Jonathan Carnes"
        : "Clint Carnes");
  const employeeExists = employees.some((employee) => employee.name === defaultEmployee);

  return {
    assignedTo: employeeExists ? defaultEmployee : employees.find((employee) => employee.is_active !== false)?.name || defaultEmployee,
    scheduledDate: defaultDate,
    blockStart: defaultBlock.start,
    blockEnd: defaultBlock.end,
  };
}

function getActionItemSmsContext(item: any) {
  const meta = (item?.metadata || {}) as Record<string, any>;
  return {
    contactName: meta.customer_name || item.customer_name || undefined,
    jobId: item.job_id || meta.job_id || undefined,
    customerId: item.customer_id || meta.customer_id || undefined,
    threadKey: meta.thread_key || meta.threadKey || null,
    fromNumber:
      meta.company_phone_number ||
      meta.companyPhoneNumber ||
      meta.called_number ||
      meta.calledNumber ||
      meta.from_number ||
      meta.fromNumber ||
      meta.to_number ||
      meta.toNumber ||
      null,
    businessUnitId: meta.business_unit_id || meta.businessUnitId || null,
  };
}

export function ActionItemCards({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const softphone = useSoftphoneContext();
  const { book, getState } = useBookingAction();
  const sharedTasks = useSharedActionItemTasks();
  const { data: employees = [] } = useEmployees();
  const [actionId, setActionId] = useState<string | null>(null);
  const [trainPhone, setTrainPhone] = useState<{ phone: string; name?: string } | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [propertySelections, setPropertySelections] = useState<Record<string, any>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [scheduleItem, setScheduleItem] = useState<any | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ assignedTo: "Clint Carnes", scheduledDate: "", blockStart: "08:00", blockEnd: "10:00" });

  const activeEmployees = (employees as any[]).filter((employee) => employee.is_active !== false);

  const openScheduleDialog = (item: any) => {
    setScheduleItem(item);
    setScheduleForm(defaultScheduleForm(item, activeEmployees));
  };

  const scheduleActionItem = async () => {
    if (!scheduleItem) return;
    if (!scheduleForm.assignedTo || !scheduleForm.scheduledDate || !scheduleForm.blockStart || !scheduleForm.blockEnd) {
      toast({ title: "Pick a person and time block", description: "This card stays in Now until it is actually on the schedule.", variant: "destructive" });
      return;
    }

    const item = scheduleItem;
    const meta = (item.metadata || {}) as any;
    setActionId(item.id);
    try {
      const claimed = await sharedTasks.claimActionItem(item);
      if (!claimed.ok) throw new Error(claimed.reason || "This card is already being handled.");

      const isQuoteLike = /\b(quote|bid|estimate)\b/i.test([
        item.title,
        item.description,
        item.suggested_action,
        meta.jarvis_intent,
        meta.quote_subject,
      ].filter(Boolean).join(" "));

      const result = await book({
        action_item_id: item.id,
        metadata: {
          ...meta,
          assigned_to: scheduleForm.assignedTo,
          scheduled_date: scheduleForm.scheduledDate,
          scheduled_time: scheduleForm.blockStart,
          scheduled_end: scheduleForm.blockEnd,
          job_type: meta.job_type || (isQuoteLike ? "estimate" : "phone_call"),
          description: meta.description || item.description || item.suggested_action || "Follow-up",
          customer_name: meta.customer_name || item.customer_name || "Unknown",
          customer_phone: meta.customer_phone || meta.phone || item.customer_phone || null,
          customer_email: meta.customer_email || meta.email || null,
          address: meta.address || null,
          override_active_work: true,
        },
        description: item.description,
        customer_phone: item.customer_phone,
      });

      if (result.ok) {
        setScheduleItem(null);
        invalidateActionItemQueues(qc);
        qc.invalidateQueries({ queryKey: ["jobs"] });
        qc.invalidateQueries({ queryKey: ["dispatch-jobs"] });
      }
    } catch (e: any) {
      toast({ title: "Could not schedule it", description: e.message, variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

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
    const claimed = await sharedTasks.claimActionItem(item);
    if (!claimed.ok) {
      toast({ title: "Card already in use", description: claimed.reason || "Try refreshing the queue.", variant: "destructive" });
      return;
    }
    setSendingId(item.id);
    try {
      const { sendSmsImpl } = await import("@/hooks/useSendSms");
      const smsContext = getActionItemSmsContext(item);
      const result = await sendSmsImpl({
        to: phone, body: draft, jobId: item.job_id || null,
        fromNumber: smsContext.fromNumber,
        businessUnitId: smsContext.businessUnitId,
        contactName: smsContext.contactName,
        relatedCustomerId: smsContext.customerId,
        source: "action_item_reply", hitlApproved: true, silent: true,
      });
      if (!result.success) throw new Error(result.error || "Send failed");
      await resolveActionItem({
        id: item.id,
        status: ACTION_ITEM_STATUS.accepted,
        userId: user?.id,
        title: item.title,
        jobId: item.job_id,
      });
      toast({ title: "Reply sent", description: draft.slice(0, 80) });
      invalidateActionItemQueues(qc);
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    }
    setSendingId(null);
  };

  const { data: items, isLoading } = useQuery({
    queryKey: ACTION_ITEMS_PENDING_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_items" as any)
        .select("*")
        .eq("status", ACTION_ITEM_STATUS.pending)
        .gte("created_at", APP_ACTION_GO_LIVE_ISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const handleAction = async (item: any, status: ActionItemResolutionStatus) => {
    setActionId(item.id);
    try {
      // UltraOffice booking via shared helper
      if (status === ACTION_ITEM_STATUS.accepted && item.category === "new_appointment" && item.metadata) {
        const selectedProperty = propertySelections[item.id];
        const metadata = {
          ...item.metadata,
          ...(selectedProperty ? {
            address: selectedProperty.address || selectedProperty.formatted,
            address_id: selectedProperty.id || null,
            requires_property_selection: false,
            selected_property_label: selectedProperty.label || null,
          } : {}),
        };
        if ((metadata as any).requires_property_selection && !(metadata as any).address_id) {
          throw new Error("Choose the service property before booking.");
        }
        const claimed = await sharedTasks.claimActionItem(item);
        if (!claimed.ok) {
          throw new Error(claimed.reason || "This card is already being handled.");
        }
        const result = await book({
          action_item_id: item.id,
          metadata,
          description: item.description,
          customer_phone: item.customer_phone,
        });
        setActionId(null);
        if (result.ok) {
          invalidateActionItemQueues(qc);
          qc.invalidateQueries({ queryKey: ["jobs"] });
          qc.invalidateQueries({ queryKey: ["dispatch-jobs"] });
        }
        return;
      }

      if (status === ACTION_ITEM_STATUS.accepted && item.category === "jarvis_action_approval" && item.metadata) {
        const meta = item.metadata as any;
        const editableField = meta.editable_message_field as string | null | undefined;
        let approvalToken = meta.approval_token;
        if (editableField) {
          const editedMessage = (replyDrafts[item.id] ?? meta.tool_args?.[editableField] ?? "").trim();
          if (!editedMessage) {
            throw new Error("Message is empty. Rewrite it or dismiss the action.");
          }
          if (editedMessage !== meta.tool_args?.[editableField]) {
            approvalToken = crypto.randomUUID();
            const updatedMeta = {
              ...meta,
              approval_token: approvalToken,
              tool_args: {
                ...(meta.tool_args || {}),
                [editableField]: editedMessage,
              },
              rewritten_at: new Date().toISOString(),
              rewritten_by: user?.id || null,
            };
            const { error: updateErr } = await supabase
              .from("action_items" as any)
              .update({ metadata: updatedMeta })
              .eq("id", item.id);
            if (updateErr) throw updateErr;
          }
        }
        const claimed = await sharedTasks.claimActionItem(item);
        if (!claimed.ok) {
          throw new Error(claimed.reason || "This card is already being handled.");
        }
        const { data, error } = await supabase.functions.invoke("ai-task-agent", {
          body: {
            mode: "approved_action",
            approved_action_item_id: item.id,
            approved_action_token: approvalToken,
          },
        });
        if (error) throw error;
        if (data?.result?.status === "error") {
          throw new Error(data.result.error || "Approved action failed");
        }
        toast({
          title: "JARVIS action approved",
          description: item.title,
        });
        invalidateActionItemQueues(qc);
        qc.invalidateQueries({ queryKey: ["jobs"] });
        qc.invalidateQueries({ queryKey: ["dispatch-jobs"] });
        qc.invalidateQueries({ queryKey: ["customers"] });
        qc.invalidateQueries({ queryKey: ["outbound_drafts"] });
        return;
      }

      await resolveActionItem({
        id: item.id,
        status,
        userId: user?.id,
        title: item.title,
        jobId: item.job_id,
      });

      toast({
        title: status === ACTION_ITEM_STATUS.accepted ? "Accepted" : "Dismissed",
        description: item.title,
      });

      invalidateActionItemQueues(qc);

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
          const itemMetadata = (item.metadata || {}) as any;
          const ownership = getActionOwnership(item);
          const scheduleable = isScheduleableActionItem(item);
          const editableApprovalField =
            item.category === "jarvis_action_approval" ? itemMetadata.editable_message_field : null;
          const editableApprovalText = editableApprovalField
            ? replyDrafts[item.id] ?? itemMetadata.tool_args?.[editableApprovalField] ?? ""
            : "";
          const propertyOptions = Array.isArray(itemMetadata.property_options)
            ? itemMetadata.property_options
            : [];
          const needsPropertySelection =
            item.category === "new_appointment" &&
            itemMetadata.requires_property_selection &&
            propertyOptions.length > 0;
          const selectedProperty = propertySelections[item.id];
          const claimState = sharedTasks.getClaimState(item);
          const isClaimedByOther = claimState.isClaimedByOther;

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
                  {isClaimedByOther && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                      {claimState.label}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      ownership.ownerType === "person"
                        ? "border-blue-500/40 text-blue-600"
                        : "border-emerald-500/40 text-emerald-600"
                    }`}
                  >
                    {ownership.ownerLabel}
                  </Badge>
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

              {needsPropertySelection && (
                <div className="rounded border border-orange-500/30 bg-orange-500/5 p-2 space-y-2">
                  <p className="text-[10px] font-medium text-orange-700">
                    Choose service property before booking
                  </p>
                  {itemMetadata.mentioned_address && (
                    <p className="text-[11px] text-muted-foreground">
                      Customer mentioned: {itemMetadata.mentioned_address}
                    </p>
                  )}
                  <div className="grid gap-1.5">
                    {propertyOptions.map((property: any, index: number) => {
                      const address = property.address || property.formatted;
                      const active = selectedProperty?.id
                        ? selectedProperty.id === property.id
                        : (selectedProperty?.address || selectedProperty?.formatted) === address;
                      return (
                        <Button
                          key={`${property.id || index}-${address}`}
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className="h-auto justify-start gap-2 whitespace-normal py-2 text-left"
                          onClick={() => setPropertySelections((prev) => ({ ...prev, [item.id]: property }))}
                          disabled={actionId === item.id || isClaimedByOther}
                        >
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium">{property.label || "Property"}</span>
                            <span className="block text-[11px] opacity-80">{address}</span>
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {editableApprovalField && (
                <div className="rounded border border-violet-500/30 bg-violet-500/5 p-2 space-y-1.5">
                  <p className="text-[10px] font-medium text-violet-700">
                    Message JARVIS wants to send (rewrite before approving)
                  </p>
                  <Textarea
                    value={editableApprovalText}
                    onChange={(e) => setReplyDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                    className="min-h-[70px] text-xs bg-background"
                    disabled={actionId === item.id || isClaimedByOther}
                  />
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
                        disabled={isDrafting || isSending || isClaimedByOther}
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
                      disabled={isSending || isDrafting || isClaimedByOther}
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleSendReply(item)}
                      disabled={isSending || isDrafting || actionId === item.id || isClaimedByOther || !hasDraft}
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
                        #{bs.result.job_number || bs.result.job_id}
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
                const trainablePhone = getActionItemPhone(item);
                const isTrainable =
                  !!trainablePhone &&
                  ["create_customer", "new_lead", "missed_call", "thread_attention"].includes(item.category);
                const bs = getState(item.id);
                const isWorking = bs.phase === "resolving" || bs.phase === "booking" || bs.phase === "syncing";
                const isBookingItem = item.category === "new_appointment";
                const isBusy = actionId === item.id || isWorking || isClaimedByOther;
                const phone = getActionItemPhone(item);
                const closeAsAccepted = () => handleAction(item, ACTION_ITEM_STATUS.accepted);
                const closeAsDismissed = () => handleAction(item, ACTION_ITEM_STATUS.dismissed);
                const callPhone = () => {
                  if (phone) softphone.setDialNumber(phone);
                  closeAsAccepted();
                };
                const textPhone = () => {
                  if (phone) openSmsComposer(phone, getActionItemSmsContext(item));
                  closeAsAccepted();
                };

                if (item.category === "missed_call") {
                  return (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={callPhone}
                        disabled={isBusy || !phone}
                      >
                        <Phone className="h-3 w-3" /> Call Back
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={textPhone}
                        disabled={isBusy || !phone}
                      >
                        <MessageSquare className="h-3 w-3" /> Text
                      </Button>
                      {isTrainable && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Train JARVIS who this is"
                          onClick={() => setTrainPhone({ phone: trainablePhone, name: (item.metadata as any)?.customer_name })}
                          disabled={isBusy}
                        >
                          <Brain className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={closeAsDismissed}
                        disabled={isBusy}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                }

                if (item.category === "create_customer") {
                  const customerId = itemMetadata.customer_id || itemMetadata.created_customer_id;
                  const reviewPath = customerId
                    ? `/customers/${customerId}`
                    : phone
                      ? `/intake?phone=${encodeURIComponent(phone)}`
                      : "/intake";
                  return (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          navigate(reviewPath);
                          closeAsAccepted();
                        }}
                        disabled={isBusy}
                      >
                        <Eye className="h-3 w-3" /> {customerId ? "Review Customer" : "Create / Link"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={textPhone}
                        disabled={isBusy || !phone}
                      >
                        <MessageSquare className="h-3 w-3" /> Text
                      </Button>
                      {isTrainable && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Train JARVIS who this is"
                          onClick={() => setTrainPhone({ phone: trainablePhone, name: (item.metadata as any)?.customer_name })}
                          disabled={isBusy}
                        >
                          <Brain className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={closeAsDismissed}
                        disabled={isBusy}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                }

                if (item.category === "new_lead") {
                  return (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={callPhone}
                        disabled={isBusy || !phone}
                      >
                        <Phone className="h-3 w-3" /> Call
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="flex-1"
                        onClick={textPhone}
                        disabled={isBusy || !phone}
                      >
                        <MessageSquare className="h-3 w-3" /> Text
                      </Button>
                      {isTrainable && (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Train JARVIS who this is"
                          onClick={() => setTrainPhone({ phone: trainablePhone, name: (item.metadata as any)?.customer_name })}
                          disabled={isBusy}
                        >
                          <Brain className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={closeAsDismissed}
                        disabled={isBusy}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                }

                if (["follow_up", "schedule_change", "eta_request", "access_note", "pet_warning", "contact_update"].includes(item.category)) {
                  const estimateId = itemMetadata.active_estimate_id || itemMetadata.upcoming_estimate_id;
                  const reviewPath = item.job_id
                    ? `/jobs/${item.job_id}`
                    : estimateId
                      ? `/estimates/${estimateId}`
                      : null;
                  return (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          if (scheduleable) {
                            openScheduleDialog(item);
                            return;
                          }
                          if (reviewPath) navigate(reviewPath);
                          closeAsAccepted();
                        }}
                        disabled={isBusy}
                      >
                        {scheduleable ? <CalendarPlus className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {scheduleable ? "Schedule" : "Review / handle"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={textPhone}
                        disabled={isBusy || !phone}
                      >
                        <MessageSquare className="h-3 w-3" /> Text
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={callPhone}
                        disabled={isBusy || !phone}
                      >
                        <Phone className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={closeAsDismissed}
                        disabled={isBusy}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                }

                return (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={scheduleable ? () => openScheduleDialog(item) : closeAsAccepted}
                      disabled={isBusy || (needsPropertySelection && !selectedProperty)}
                    >
                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      {scheduleable
                        ? "Schedule"
                        : isBookingItem
                        ? (bs.phase === "resolving" ? "Resolving…"
                          : bs.phase === "booking" ? "Booking..."
                          : bs.phase === "syncing" ? "Updating..."
                          : bs.phase === "booked" ? "Booked"
                          : bs.phase === "failed" ? "Retry Booking"
                          : needsPropertySelection && !selectedProperty ? "Choose Property"
                          : "Accept & Book")
                        : ownership.ownerType === "office_queue"
                          ? "Mark handled"
                          : "Accept"}
                    </Button>
                    {isTrainable && (
                      <Button
                        size="sm"
                        variant="outline"
                        title="Train JARVIS who this is"
                        onClick={() => setTrainPhone({ phone: trainablePhone, name: (item.metadata as any)?.customer_name })}
                        disabled={isBusy}
                      >
                        <Brain className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={closeAsDismissed}
                      disabled={isBusy}
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

      <Dialog open={!!scheduleItem} onOpenChange={(open) => !open && setScheduleItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Put this on the schedule</DialogTitle>
            <DialogDescription>
              Pick who owns it and the time block. The card stays in Now until it is actually on the calendar.
            </DialogDescription>
          </DialogHeader>

          {scheduleItem && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-sm font-semibold">{scheduleItem.title}</p>
                {scheduleItem.description && (
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{scheduleItem.description}</p>
                )}
              </div>

              <label className="grid gap-1.5 text-sm font-medium">
                Person responsible
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={scheduleForm.assignedTo}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, assignedTo: event.target.value }))}
                >
                  {activeEmployees.map((employee: any) => (
                    <option key={employee.id} value={employee.name}>{employee.name}</option>
                  ))}
                  {!activeEmployees.some((employee: any) => employee.name === scheduleForm.assignedTo) && (
                    <option value={scheduleForm.assignedTo}>{scheduleForm.assignedTo}</option>
                  )}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                Day
                <Input
                  type="date"
                  value={scheduleForm.scheduledDate}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, scheduledDate: event.target.value }))}
                />
              </label>

              <div className="grid gap-2">
                <p className="text-sm font-medium">Time block</p>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_BLOCKS.map((block) => {
                    const active = scheduleForm.blockStart === block.start && scheduleForm.blockEnd === block.end;
                    return (
                      <Button
                        key={block.label}
                        type="button"
                        variant={active ? "default" : "outline"}
                        onClick={() => setScheduleForm((form) => ({ ...form, blockStart: block.start, blockEnd: block.end }))}
                      >
                        {block.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleItem(null)}>Not yet</Button>
            <Button onClick={scheduleActionItem} disabled={!!scheduleItem && actionId === scheduleItem.id}>
              {scheduleItem && actionId === scheduleItem.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Schedule it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
