import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, ChevronDown, ChevronUp, Loader2, Send, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ACTION_ITEM_STATUS,
  invalidateActionItemQueues,
  resolveActionItem,
} from "@/lib/actionItemLifecycle";
import { useSharedActionItemTasks } from "@/hooks/useSharedActionItemTasks";

interface ReminderPreview {
  jobId: string;
  customerName: string;
  phone: string;
  smsPreview: string;
}

export function ReminderBatchCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sharedTasks = useSharedActionItemTasks("reminder-batch-shared-action-item-tasks");

  // One-time stale cleanup: mark any pending reminder_batch items older than today as dismissed
  useEffect(() => {
    (async () => {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      await supabase
        .from("action_items")
        .update({ status: ACTION_ITEM_STATUS.dismissed, resolved_at: new Date().toISOString() })
        .eq("category", "reminder_batch")
        .eq("status", ACTION_ITEM_STATUS.pending)
        .lt("created_at", todayStart.toISOString());
      qc.invalidateQueries({ queryKey: ["reminder_batch_card"] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: actionItem } = useQuery({
    queryKey: ["reminder_batch_card"],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("action_items")
        .select("id, description")
        .eq("category", "reminder_batch")
        .eq("status", ACTION_ITEM_STATUS.pending)
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (!data || data.length === 0) return null;
      const item = data[0];
      let previews: ReminderPreview[] = [];
      let parseError: string | null = null;
      try {
        previews = JSON.parse(item.description || "[]");
      } catch (error: any) {
        parseError = error?.message || "Reminder preview data could not be read.";
      }
      return { id: item.id, previews, parseError };
    },
    refetchInterval: 60_000,
  });

  if (!actionItem) return null;

  const { previews } = actionItem;

  const handleSendAll = async () => {
    setSending(true);
    try {
      const claimed = await sharedTasks.claimActionItem({ id: actionItem.id });
      if (!claimed.ok) throw new Error(claimed.reason || "This reminder batch is already being handled.");

      const jobIds = previews.map((p) => p.jobId);
      const { error } = await supabase.functions.invoke("send-job-reminders", {
        body: { batch_job_ids: jobIds },
      });
      if (error) throw error;

      await resolveActionItem({
        id: actionItem.id,
        status: ACTION_ITEM_STATUS.accepted,
        title: "Appointment reminder batch",
      });

      toast({ title: "Reminders Sent", description: `${previews.length} appointment reminders sent.` });
      qc.invalidateQueries({ queryKey: ["reminder_batch_card"] });
      invalidateActionItemQueues(qc);
    } catch (e: any) {
      toast({ title: "Error sending reminders", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await resolveActionItem({
        id: actionItem.id,
        status: ACTION_ITEM_STATUS.dismissed,
        title: "Appointment reminder batch",
      });
      qc.invalidateQueries({ queryKey: ["reminder_batch_card"] });
      invalidateActionItemQueues(qc);
    } catch (e: any) {
      toast({ title: "Error dismissing", description: e.message, variant: "destructive" });
    }
    setDismissing(false);
  };

  if (actionItem.parseError) {
    return (
      <div className="rounded-lg border-2 border-destructive/30 bg-destructive/5 p-3 space-y-3">
        <div className="flex items-start gap-2">
          <div className="rounded-full bg-destructive/10 p-1.5">
            <Bell className="h-4 w-4 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Appointment reminder batch needs cleanup</p>
            <p className="text-xs text-muted-foreground">
              Jarvis found a reminder batch, but its preview details could not be read.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleDismiss} disabled={dismissing} className="w-full">
          {dismissing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <X className="h-3.5 w-3.5 mr-1.5" />}
          Dismiss cleanup card
        </Button>
      </div>
    );
  }

  if (previews.length === 0) return null;

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-primary/10 p-1.5">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Send Appointment Reminders?</p>
          <p className="text-xs text-muted-foreground">
            {previews.length} customer{previews.length !== 1 ? "s" : ""} scheduled for tomorrow
          </p>
        </div>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          {dismissing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      </div>

      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1 text-xs text-primary hover:underline w-full">
            <MessageSquare className="h-3 w-3" />
            {expanded ? "Hide" : "Preview"} messages
            {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2 max-h-60 overflow-y-auto">
          {previews.map((p, i) => (
            <div key={i} className="rounded-md border bg-background p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{p.customerName}</span>
                <span className="text-[10px] text-muted-foreground">{p.phone}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{p.smsPreview}</p>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Button
        size="sm"
        className="w-full"
        onClick={handleSendAll}
        disabled={sending}
      >
        {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
        Send All Reminders ({previews.length})
      </Button>
    </div>
  );
}
