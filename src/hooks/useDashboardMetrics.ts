import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard_metrics"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      // Jobs dispatched today
      const { count: dispatchedToday } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("scheduled_date", today)
        .not("dispatch_sent_at", "is", null);

      // Jobs awaiting payment (invoice sent but not paid)
      const { count: awaitingPayment } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .not("invoice_sent_at", "is", null)
        .is("payment_collected_at", null)
        .not("status", "in", '("canceled")');

      // Jobs completed this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: completedThisWeek } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["done", "invoiced"])
        .gte("completed_at", weekAgo.toISOString());

      // Total active jobs
      const { count: totalActive } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .not("status", "in", '("done","invoiced","canceled")');

      return {
        dispatchedToday: dispatchedToday || 0,
        awaitingPayment: awaitingPayment || 0,
        completedThisWeek: completedThisWeek || 0,
        totalActive: totalActive || 0,
      };
    },
  });
}
