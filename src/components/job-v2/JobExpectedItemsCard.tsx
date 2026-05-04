import { useQueryClient } from "@tanstack/react-query";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { useJobActions } from "@/hooks/useJobActions";
import { useJobCart } from "@/hooks/useJobCart";
import { usePartsOrders } from "@/hooks/usePartsOrders";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getExpectedJobItems } from "@/lib/expectedJobItems";
import { ExpectedItemsCard } from "@/components/work/ExpectedItemsCard";

export function JobExpectedItemsCard({ job, jobId }: { job: any; jobId: string }) {
  const { data: invoices = [] } = useCustomerInvoices(jobId);
  const { data: partsOrders = [] } = usePartsOrders(jobId);
  const { cart, itemCount } = useJobCart(jobId);
  const queryClient = useQueryClient();
  const actions = useJobActions(jobId, job);
  const items = getExpectedJobItems(job, invoices as any[], partsOrders as any[], cart ? { ...cart, item_count: itemCount } : null);

  const stampJob = async (_key: string, updates: Record<string, unknown>, activity: string, label: string) => {
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
    }
  };

  const getQuickAction = (key: string) => {
    const now = new Date().toISOString();
    switch (key) {
      case "confirmation":
        return {
          label: "Send",
          busyKey: "reminder",
          run: actions.sendAppointmentReminder,
          secondaryLabel: "Mark manually",
          secondaryBusyKey: "manual",
          secondaryRun: actions.markReminderSentManually,
        };
      case "dispatch":
        return { label: "Send OMW", busyKey: "omw", run: actions.sendOnMyWay };
      case "on_site":
        return { label: "Start job", busyKey: "start", run: actions.startJob };
      case "completion":
      case "site_visit":
        return { label: "Finish", busyKey: "finish", run: actions.finishJob };
      case "review":
        return {
          label: "Send",
          busyKey: "review",
          run: actions.sendReviewRequest,
          secondaryLabel: "Mark manually",
          secondaryBusyKey: "manual",
          secondaryRun: actions.markReviewSentManually,
        };
      case "follow_up":
        return {
          label: "Close",
          busyKey: key,
          run: () => stampJob(key, { follow_up_completed_at: now }, "follow_up_closed", "Follow-up closed"),
        };
      default:
        return null;
    }
  };

  return (
    <ExpectedItemsCard
      items={items}
      subtitle="Auto-closes as real job actions happen."
      quickActions={(item) => {
        const quickAction = getQuickAction(item.key);
        if (!quickAction) return null;
        return {
          label: quickAction.label,
          busy: actions.busy === quickAction.busyKey || (quickAction.busyKey === "omw" && actions.sendingOMW),
          run: quickAction.run,
          secondaryLabel: quickAction.secondaryLabel,
          secondaryBusy: actions.busy === quickAction.secondaryBusyKey,
          secondaryRun: quickAction.secondaryRun,
        };
      }}
    />
  );
}
