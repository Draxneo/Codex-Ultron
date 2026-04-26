import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subMonths, subWeeks, startOfYear, startOfMonth, endOfMonth, format } from "date-fns";

export type ReportRange = "1w" | "1m" | "lm" | "3m" | "6m" | "ytd" | "1y" | "2y";

export function getRangeStart(range: ReportRange): Date {
  const now = new Date();
  switch (range) {
    case "1w": return subWeeks(now, 1);
    case "1m": return subMonths(now, 1);
    case "lm": return startOfMonth(subMonths(now, 1));
    case "3m": return subMonths(now, 3);
    case "6m": return subMonths(now, 6);
    case "ytd": return startOfYear(now);
    case "1y": return subMonths(now, 12);
    case "2y": return subMonths(now, 24);
  }
}

export function getRangeEnd(range: ReportRange): Date | null {
  if (range === "lm") return endOfMonth(subMonths(new Date(), 1));
  return null;
}

function rangeToMonths(range: ReportRange): number {
  switch (range) {
    case "1w": return 1;
    case "1m": return 1;
    case "lm": return 2;
    case "3m": return 3;
    case "6m": return 6;
    case "ytd": {
      const now = new Date();
      return now.getMonth() + 1;
    }
    case "1y": return 12;
    case "2y": return 24;
  }
}

export function useRevenueByMonth(range: ReportRange = "6m") {
  const months = rangeToMonths(range);
  return useQuery({
    queryKey: ["report_revenue_by_month", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_revenue_by_month", {
        months_back: months,
      });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        month: row.month,
        revenue: Math.round(Number(row.revenue)),
      }));
    },
  });
}

export function useJobsByTech(range: ReportRange = "6m") {
  const rangeStart = getRangeStart(range);
  const rangeEnd = getRangeEnd(range);
  const startStr = format(rangeStart, "yyyy-MM-dd");
  const endStr = rangeEnd ? format(rangeEnd, "yyyy-MM-dd") : null;
  return useQuery({
    queryKey: ["report_jobs_by_tech", range],
    queryFn: async () => {
      let q = supabase
        .from("jobs")
        .select("assigned_to, status, scheduled_date")
        .not("assigned_to", "is", null)
        .not("scheduled_date", "is", null)
        .gte("scheduled_date", startStr);
      if (endStr) q = q.lte("scheduled_date", endStr);
      const { data, error } = await q;
      if (error) throw error;

      const byTech: Record<string, { completed: number; total: number }> = {};
      (data || []).forEach((j) => {
        const name = j.assigned_to || "Unassigned";
        if (!byTech[name]) byTech[name] = { completed: 0, total: 0 };
        byTech[name].total++;
        if (j.status === "done") byTech[name].completed++;
      });
      return Object.entries(byTech)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

export function useJobsByType(range: ReportRange = "6m") {
  const rangeStart = getRangeStart(range);
  const rangeEnd = getRangeEnd(range);
  const startStr = format(rangeStart, "yyyy-MM-dd");
  const endStr = rangeEnd ? format(rangeEnd, "yyyy-MM-dd") : null;
  return useQuery({
    queryKey: ["report_jobs_by_type", range],
    queryFn: async () => {
      let q = supabase
        .from("jobs")
        .select("job_type, scheduled_date")
        .not("scheduled_date", "is", null)
        .gte("scheduled_date", startStr);
      if (endStr) q = q.lte("scheduled_date", endStr);
      const { data, error } = await q;
      if (error) throw error;

      const counts: Record<string, number> = {};
      (data || []).forEach((j) => {
        const t = j.job_type || "other";
        counts[t] = (counts[t] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);
    },
  });
}

export function useEstimateCloseRate(range: ReportRange = "6m") {
  const rangeStart = getRangeStart(range);
  const rangeEnd = getRangeEnd(range);
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd ? rangeEnd.toISOString() : null;
  return useQuery({
    queryKey: ["report_estimate_close_rate", range],
    queryFn: async () => {
      let q = supabase
        .from("estimates")
        .select("work_status, created_at")
        .gte("created_at", startIso);
      if (endIso) q = q.lte("created_at", endIso);
      const { data, error } = await q;
      if (error) throw error;

      const total = data?.length || 0;
      const won = (data || []).filter((e) => e.work_status === "won").length;
      const lost = (data || []).filter((e) => e.work_status === "lost").length;
      const canceled = (data || []).filter((e) => e.work_status === "canceled").length;
      const pending = total - won - lost - canceled;
      return { total, won, lost, pending, closeRate: total > 0 ? Math.round((won / total) * 100) : 0 };
    },
  });
}

/** @deprecated Legacy overdue task trend removed — workflow engine handles progression */
export function useOverdueTaskTrend(range: ReportRange = "6m") {
  return useQuery({
    queryKey: ["report_overdue_trend", range],
    enabled: false,
    queryFn: async () => ({ onTime: 0, late: 0, stillOverdue: 0, total: 0 }),
  });
}
