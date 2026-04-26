import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServiceMetric {
  service: string;
  call_count: number;
  total_cost_cents: number;
  tokens_total: number;
}

export interface FunctionMetric {
  function_name: string;
  call_count: number;
  total_cost_cents: number;
}

export interface DailyTrend {
  day: string;
  service: string;
  call_count: number;
  total_cost_cents: number;
}

async function fetchMetrics() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  // Fetch raw rows for today
  const { data: todayRows } = await supabase
    .from("api_usage_log")
    .select("service, function_name, estimated_cost_cents, tokens_used")
    .gte("created_at", todayStart)
    .order("created_at", { ascending: false })
    .limit(1000) as any;

  // Fetch raw rows for 7 days
  const { data: weekRows } = await supabase
    .from("api_usage_log")
    .select("service, created_at, estimated_cost_cents")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(1000) as any;

  // Aggregate today by service
  const serviceMap = new Map<string, ServiceMetric>();
  for (const row of (todayRows || [])) {
    const existing = serviceMap.get(row.service) || { service: row.service, call_count: 0, total_cost_cents: 0, tokens_total: 0 };
    existing.call_count++;
    existing.total_cost_cents += Number(row.estimated_cost_cents) || 0;
    existing.tokens_total += row.tokens_used || 0;
    serviceMap.set(row.service, existing);
  }

  // Aggregate today by function
  const fnMap = new Map<string, FunctionMetric>();
  for (const row of (todayRows || [])) {
    const existing = fnMap.get(row.function_name) || { function_name: row.function_name, call_count: 0, total_cost_cents: 0 };
    existing.call_count++;
    existing.total_cost_cents += Number(row.estimated_cost_cents) || 0;
    fnMap.set(row.function_name, existing);
  }

  // Aggregate 7-day trend by day+service
  const trendMap = new Map<string, DailyTrend>();
  for (const row of (weekRows || [])) {
    const day = row.created_at?.slice(0, 10) || "unknown";
    const key = `${day}__${row.service}`;
    const existing = trendMap.get(key) || { day, service: row.service, call_count: 0, total_cost_cents: 0 };
    existing.call_count++;
    existing.total_cost_cents += Number(row.estimated_cost_cents) || 0;
    trendMap.set(key, existing);
  }

  const todayCostCents = Array.from(serviceMap.values()).reduce((s, m) => s + m.total_cost_cents, 0);

  return {
    byService: Array.from(serviceMap.values()).sort((a, b) => b.total_cost_cents - a.total_cost_cents),
    byFunction: Array.from(fnMap.values()).sort((a, b) => b.call_count - a.call_count),
    dailyTrend: Array.from(trendMap.values()).sort((a, b) => a.day.localeCompare(b.day)),
    todayCostCents,
    todayCallCount: todayRows?.length || 0,
  };
}

export function useApiUsageMetrics() {
  return useQuery({
    queryKey: ["api-usage-metrics"],
    queryFn: fetchMetrics,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
