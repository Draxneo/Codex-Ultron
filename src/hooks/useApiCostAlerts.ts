import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { API_COST_LIMITS, getSeverity, type AlertSeverity, type ApiServiceLimit } from "@/config/apiCostLimits";
import { getApiCostWindowStart } from "@/config/apiCostFreshStart";

export interface ServiceUsageStatus {
  limit: ApiServiceLimit;
  currentCostUsd: number;
  currentCalls: number;
  percentOfCostLimit: number;  // 0-200+
  percentOfCallLimit: number;
  severity: AlertSeverity;
  projectedDailyCostUsd: number; // based on hours-elapsed extrapolation
}

export interface ApiCostAlertsResult {
  statuses: ServiceUsageStatus[];
  hasCritical: boolean;
  hasWarning: boolean;
  criticalServices: string[]; // labels
  totalCostTodayUsd: number;
  projectedTotalDailyUsd: number;
  windowStart: Date;
}

async function fetchAlerts(activeJobCount: number): Promise<ApiCostAlertsResult> {
  const windowStart = getApiCostWindowStart();

  // Pull active jobs count + cost rows in parallel
  const { data, error } = await supabase
    .from("api_usage_log")
    .select("service, estimated_cost_cents")
    .gte("created_at", windowStart.toISOString())
    .limit(50000);

  if (error) throw error;

  // Aggregate
  const map = new Map<string, { calls: number; cents: number }>();
  for (const row of (data || []) as Array<{ service: string; estimated_cost_cents: number | null }>) {
    const e = map.get(row.service) || { calls: 0, cents: 0 };
    e.calls += 1;
    e.cents += Number(row.estimated_cost_cents) || 0;
    map.set(row.service, e);
  }

  // Hours elapsed since window start (used for projection; min 1 to avoid div-by-zero)
  const now = new Date();
  const hoursElapsed = Math.max(1, (now.getTime() - windowStart.getTime()) / 3_600_000);
  const projectionFactor = 24 / hoursElapsed;

  const statuses: ServiceUsageStatus[] = API_COST_LIMITS.map(limit => {
    const usage = map.get(limit.service) || { calls: 0, cents: 0 };
    const currentCostUsd = usage.cents / 100;
    const currentCalls = usage.calls;
    return {
      limit,
      currentCostUsd,
      currentCalls,
      percentOfCostLimit: (currentCostUsd / limit.dailyCostUsd) * 100,
      percentOfCallLimit: (currentCalls / limit.dailyCalls) * 100,
      severity: getSeverity(currentCostUsd, currentCalls, limit, activeJobCount),
      projectedDailyCostUsd: currentCostUsd * projectionFactor,
    };
  });

  const totalCostTodayUsd = statuses.reduce((s, r) => s + r.currentCostUsd, 0);
  const projectedTotalDailyUsd = statuses.reduce((s, r) => s + r.projectedDailyCostUsd, 0);

  const criticalServices = statuses.filter(s => s.severity === "critical").map(s => s.limit.label);

  return {
    statuses,
    hasCritical: criticalServices.length > 0,
    hasWarning: statuses.some(s => s.severity === "warning"),
    criticalServices,
    totalCostTodayUsd,
    projectedTotalDailyUsd,
    windowStart,
  };
}

export function useApiCostAlerts(activeJobCount = 0) {
  return useQuery({
    queryKey: ["api-cost-alerts", activeJobCount],
    queryFn: () => fetchAlerts(activeJobCount),
    refetchInterval: 60_000, // poll every minute
    staleTime: 30_000,
  });
}
