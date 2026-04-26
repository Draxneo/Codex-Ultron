import { useState } from "react";
import { CheckCircle2, CircleDashed, Clock3, SkipForward, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { usePartsOrders } from "@/hooks/usePartsOrders";
import { useJobCart } from "@/hooks/useJobCart";
import { getExpectedJobItems, getExpectedJobSummary, type ExpectedItemStatus } from "@/lib/expectedJobItems";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useSendOnMyWay } from "@/hooks/useSendOnMyWay";

const STATUS_META: Record<ExpectedItemStatus, { icon: React.ElementType; className: string; label: string }> = {
  done: { icon: CheckCircle2, className: "text-emerald-600 bg-emerald-600/10", label: "Done" },
  needs_attention: { icon: AlertTriangle, className: "text-amber-600 bg-amber-500/10", label: "Needs attention" },
  waiting: { icon: Clock3, className: "text-blue-600 bg-blue-500/10", label: "Waiting" },
  upcoming: { icon: CircleDashed, className: "text-muted-foreground bg-muted", label: "Upcoming" },
  skipped: { icon: SkipForward, className: "text-muted-foreground bg-muted", label: "Skipped" },
};

export function JobExpectedItemsCard({ job, jobId }: { job: any; jobId: string }) {
  const { data: invoices = [] } = useCustomerInvoices(jobId);
  const { data: partsOrders = [] } = usePartsOrders(jobId);
  const { cart, itemCount } = useJobCart(jobId);
  const { send: sendOMW } = useSendOnMyWay();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const items = getExpectedJobItems(job, invoices as any[], partsOrders as any[], cart ? { ...cart, item_count: itemCount } : null);
  const summary = getExpectedJobSummary(items);
  const openItems = items.filter((item) => item.status !== "done" && item.status !== "skipped");

  const stampJob = async (key: string, updates: Record<string, unknown>, activity: string, label: string) => {
    setBusy(key);
    try {
      const { error } = await supabase.from("jobs").update(updates as any).eq("id", jobId);
      if (error) throw error;
      await supabase.from("activity_log").insert({ job_id: jobId, action: activity, details: label });
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["activity_log"] });
      toast({ title: label });
    } catch (e: any) {
      toast({ title: "Could not update job", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const getQuickAction = (key: string) => {
    const now = new Date().toISOString();
    switch (key) {
      case "confirmation":
        return {
          label: "Mark sent",
          run: () => stampJob(key, { confirmation_sent_at: now }, "appointment_reminder_marked_sent", "Reminder marked as sent"),
        };
      case "dispatch":
        return {
          label: "Send OMW",
          run: async () => {
            setBusy(key);
            try {
              await sendOMW({
                jobId,
                customerPhone: job?.customer_phone,
                customerName: job?.customer_name,
                jobAddress: job?.address,
                employeeName: job?.assigned_to,
                employeeId: job?.assigned_employee_id || job?.employee_id || null,
              });
            } finally {
              setBusy(null);
            }
          },
        };
      case "on_site":
        return {
          label: "Start job",
          run: () => stampJob(key, { status: "in_progress", started_at: now }, "job_started", "Job marked in progress"),
        };
      case "completion":
      case "site_visit":
        return {
          label: "Finish",
          run: () => stampJob(key, { completed_at: now, completion_form_sent_at: now, status: "done" }, "job_finished", "Completion recorded"),
        };
      case "review":
        return {
          label: "Mark sent",
          run: () => stampJob(key, { review_request_sent_at: now }, "review_request_marked_sent", "Review request marked as sent"),
        };
      case "follow_up":
        return {
          label: "Close",
          run: () => stampJob(key, { follow_up_completed_at: now }, "follow_up_closed", "Follow-up closed"),
        };
      default:
        return null;
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">What&apos;s Next</h3>
            <p className="text-xs text-muted-foreground">
              Auto-closes as real job actions happen.
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold">{summary.done}/{summary.total}</div>
            <div className="text-[11px] text-muted-foreground">{summary.percent}% complete</div>
          </div>
        </div>
        <Progress value={summary.percent} className="h-1.5 mt-3" />
      </div>

      <div className="divide-y">
        {items.map((item) => {
          const meta = STATUS_META[item.status];
          const Icon = meta.icon;
          const quickAction = item.status === "done" || item.status === "skipped" ? null : getQuickAction(item.key);
          return (
            <div key={item.key} className="px-4 py-2.5 flex items-start gap-3">
              <span className={cn("mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0", meta.className)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn("text-sm font-medium truncate", item.status === "done" && "text-muted-foreground line-through")}>
                    {item.label}
                  </p>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.owner}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
              </div>
              {quickAction && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  disabled={busy === item.key}
                  onClick={quickAction.run}
                >
                  {busy === item.key ? "Saving..." : quickAction.label}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {openItems.length === 0 && (
        <div className="px-4 py-3 bg-emerald-600/5 text-xs text-emerald-700 dark:text-emerald-400">
          All expected items are closed for this job.
        </div>
      )}
    </Card>
  );
}
