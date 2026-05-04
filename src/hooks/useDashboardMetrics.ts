import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APP_ACTION_GO_LIVE_DATE, CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard_metrics"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      // Jobs dispatched today
      const { count: dispatchedToday, error: dispatchedError } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("scheduled_date", today)
        .not("dispatch_sent_at", "is", null);
      if (dispatchedError) throw dispatchedError;

      // Jobs awaiting payment (invoice sent but not paid)
      const { count: awaitingPayment, error: awaitingPaymentError } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .not("invoice_sent_at", "is", null)
        .is("payment_collected_at", null)
        .not("status", "in", CLOSED_WORK_STATUS_FILTER)
        .gte("created_at", APP_ACTION_GO_LIVE_DATE);
      if (awaitingPaymentError) throw awaitingPaymentError;

      // Jobs completed this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: completedThisWeek, error: completedError } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["done", "invoiced"])
        .gte("completed_at", weekAgo.toISOString());
      if (completedError) throw completedError;

      // Total active jobs
      const { count: totalActive, error: activeError } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .not("status", "in", CLOSED_WORK_STATUS_FILTER)
        .gte("created_at", APP_ACTION_GO_LIVE_DATE);
      if (activeError) throw activeError;

      return {
        dispatchedToday: dispatchedToday || 0,
        awaitingPayment: awaitingPayment || 0,
        completedThisWeek: completedThisWeek || 0,
        totalActive: totalActive || 0,
      };
    },
  });
}
