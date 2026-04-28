import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { API_COST_LIMITS, getSeverity, type AlertSeverity, type ApiServiceLimit } from "@/config/apiCostLimits";
import { getApiCostWindowStart } from "@/config/apiCostFreshStart";

const DAY_MS = 86_400_000;
const API_USAGE_LIMIT = 50_000;
const RETIRED_API_SERVICES = new Set(["sendgrid"]);

export const apiUsageObservabilityQueryKey = ["api-usage-observability"] as const;

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

export interface ApiUsageMetricsResult {
  byService: ServiceMetric[];
  byFunction: FunctionMetric[];
  dailyTrend: DailyTrend[];
  todayCostCents: number;
  todayCallCount: number;
}

export interface HourlyServicePoint {
  hour: string;
  hourLabel: string;
  [service: string]: number | string;
}

export interface ApiUsageHourlyResult {
  points: HourlyServicePoint[];
  services: string[];
}

export interface ServiceUsageStatus {
  limit: ApiServiceLimit;
  currentCostUsd: number;
  currentCalls: number;
  percentOfCostLimit: number;
  percentOfCallLimit: number;
  severity: AlertSeverity;
  projectedDailyCostUsd: number;
}

export interface ApiCostAlertsResult {
  statuses: ServiceUsageStatus[];
  hasCritical: boolean;
  hasWarning: boolean;
  criticalServices: string[];
  totalCostTodayUsd: number;
  projectedTotalDailyUsd: number;
  windowStart: Date;
}

export interface ApiUsageObservabilityViewModel {
  metrics: ApiUsageMetricsResult;
  hourly: ApiUsageHourlyResult;
  alerts: ApiCostAlertsResult;
  rollupRowsUsed: number;
  recentDetailRowsUsed: number;
  trendSourceLabel: string;
}

interface ApiUsageDetailRow {
  service: string | null;
  function_name: string | null;
  endpoint?: string | null;
  created_at: string;
  estimated_cost_cents: number | string | null;
  tokens_used: number | string | null;
}

interface ApiUsageRollupRow {
  day: string;
  service: string | null;
  function_name: string | null;
  endpoint?: string | null;
  call_count: number | string | null;
  total_cost_cents: number | string | null;
  tokens_total: number | string | null;
}

function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function serviceName(value: string | null | undefined) {
  return value?.trim() || "unknown";
}

function functionName(value: string | null | undefined) {
  return value?.trim() || "unknown";
}

function endpointName(value: string | null | undefined) {
  return value?.trim() || "";
}

function detailDedupKey(row: ApiUsageDetailRow) {
  return [
    row.created_at.slice(0, 10),
    serviceName(row.service),
    functionName(row.function_name),
    endpointName(row.endpoint),
  ].join("__");
}

function rollupDedupKey(row: ApiUsageRollupRow) {
  return [
    row.day,
    serviceName(row.service),
    functionName(row.function_name),
    endpointName(row.endpoint),
  ].join("__");
}

function addServiceMetric(
  map: Map<string, ServiceMetric>,
  service: string,
  callCount: number,
  costCents: number,
  tokens: number,
) {
  const existing = map.get(service) || { service, call_count: 0, total_cost_cents: 0, tokens_total: 0 };
  existing.call_count += callCount;
  existing.total_cost_cents += costCents;
  existing.tokens_total += tokens;
  map.set(service, existing);
}

function addFunctionMetric(
  map: Map<string, FunctionMetric>,
  function_name: string,
  callCount: number,
  costCents: number,
) {
  const existing = map.get(function_name) || { function_name, call_count: 0, total_cost_cents: 0 };
  existing.call_count += callCount;
  existing.total_cost_cents += costCents;
  map.set(function_name, existing);
}

function addDailyTrend(
  map: Map<string, DailyTrend>,
  day: string,
  service: string,
  callCount: number,
  costCents: number,
) {
  const key = `${day}__${service}`;
  const existing = map.get(key) || { day, service, call_count: 0, total_cost_cents: 0 };
  existing.call_count += callCount;
  existing.total_cost_cents += costCents;
  map.set(key, existing);
}

function formatHour(h: number) {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function emptyHourlyBuckets() {
  const buckets: Record<string, Record<string, number>> = {};
  for (let h = 0; h < 24; h++) {
    buckets[String(h).padStart(2, "0")] = {};
  }
  return buckets;
}

function buildHourlyFromRows(rows: ApiUsageDetailRow[]): ApiUsageHourlyResult {
  const services = new Set<string>(API_COST_LIMITS.map((limit) => limit.service));
  const buckets = emptyHourlyBuckets();

  for (const row of rows) {
    const service = serviceName(row.service);
    if (RETIRED_API_SERVICES.has(service)) continue;
    services.add(service);
    const date = new Date(row.created_at);
    const hour = String(date.getHours()).padStart(2, "0");
    buckets[hour][service] = (buckets[hour][service] || 0) + 1;
  }

  const sortedServices = Array.from(services).sort();
  const points: HourlyServicePoint[] = [];

  for (let h = 0; h < 24; h++) {
    const hour = String(h).padStart(2, "0");
    const point: HourlyServicePoint = { hour, hourLabel: formatHour(h) };
    for (const service of sortedServices) {
      point[service] = buckets[hour][service] || 0;
    }
    points.push(point);
  }

  return { points, services: sortedServices };
}

function buildAlertsFromRows(
  rows: ApiUsageDetailRow[],
  windowStart: Date,
  activeJobCount: number,
): ApiCostAlertsResult {
  const usageByService = new Map<string, { calls: number; cents: number }>();

  for (const row of rows) {
    const service = serviceName(row.service);
    const existing = usageByService.get(service) || { calls: 0, cents: 0 };
    existing.calls += 1;
    existing.cents += Number(row.estimated_cost_cents) || 0;
    usageByService.set(service, existing);
  }

  const hoursElapsed = Math.max(1, (Date.now() - windowStart.getTime()) / 3_600_000);
  const projectionFactor = 24 / hoursElapsed;

  const statuses: ServiceUsageStatus[] = API_COST_LIMITS.map((limit) => {
    const usage = usageByService.get(limit.service) || { calls: 0, cents: 0 };
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

  const totalCostTodayUsd = statuses.reduce((sum, status) => sum + status.currentCostUsd, 0);
  const projectedTotalDailyUsd = statuses.reduce((sum, status) => sum + status.projectedDailyCostUsd, 0);
  const criticalServices = statuses.filter((status) => status.severity === "critical").map((status) => status.limit.label);

  return {
    statuses,
    hasCritical: criticalServices.length > 0,
    hasWarning: statuses.some((status) => status.severity === "warning"),
    criticalServices,
    totalCostTodayUsd,
    projectedTotalDailyUsd,
    windowStart,
  };
}

function buildViewModel(
  detailRows: ApiUsageDetailRow[],
  rollupRows: ApiUsageRollupRow[],
  activeJobCount: number,
): ApiUsageObservabilityViewModel {
  const todayStart = startOfLocalDay();
  const windowStart = getApiCostWindowStart();

  const serviceMap = new Map<string, ServiceMetric>();
  const functionMap = new Map<string, FunctionMetric>();
  const trendMap = new Map<string, DailyTrend>();
  const rollupKeys = new Set<string>();

  for (const row of rollupRows) {
    const day = row.day;
    const service = serviceName(row.service);
    const calls = Number(row.call_count) || 0;
    const costCents = Number(row.total_cost_cents) || 0;
    rollupKeys.add(rollupDedupKey(row));
    addDailyTrend(trendMap, day, service, calls, costCents);
  }

  const todayRows: ApiUsageDetailRow[] = [];
  const alertRows: ApiUsageDetailRow[] = [];
  let recentDetailRowsUsed = 0;

  for (const row of detailRows) {
    if (!row.created_at) continue;
    if (!rollupKeys.has(detailDedupKey(row))) {
      recentDetailRowsUsed += 1;
      addDailyTrend(
        trendMap,
        row.created_at.slice(0, 10),
        serviceName(row.service),
        1,
        Number(row.estimated_cost_cents) || 0,
      );
    }

    const createdAt = new Date(row.created_at);
    if (createdAt >= todayStart) {
      const service = serviceName(row.service);
      if (RETIRED_API_SERVICES.has(service)) continue;
      const costCents = Number(row.estimated_cost_cents) || 0;
      const tokens = Number(row.tokens_used) || 0;
      todayRows.push(row);
      addServiceMetric(serviceMap, service, 1, costCents, tokens);
      addFunctionMetric(functionMap, functionName(row.function_name), 1, costCents);
    }

    if (createdAt >= windowStart) {
      alertRows.push(row);
    }
  }

  const metrics: ApiUsageMetricsResult = {
    byService: API_COST_LIMITS
      .map((limit) => serviceMap.get(limit.service) || {
        service: limit.service,
        call_count: 0,
        total_cost_cents: 0,
        tokens_total: 0,
      })
      .sort((a, b) => b.total_cost_cents - a.total_cost_cents),
    byFunction: Array.from(functionMap.values()).sort((a, b) => b.call_count - a.call_count),
    dailyTrend: Array.from(trendMap.values()).sort((a, b) => a.day.localeCompare(b.day)),
    todayCostCents: Array.from(serviceMap.values()).reduce((sum, metric) => sum + metric.total_cost_cents, 0),
    todayCallCount: todayRows.length,
  };

  return {
    metrics,
    hourly: buildHourlyFromRows(todayRows),
    alerts: buildAlertsFromRows(alertRows, windowStart, activeJobCount),
    rollupRowsUsed: rollupRows.length,
    recentDetailRowsUsed,
    trendSourceLabel: rollupRows.length > 0
      ? "Daily rollups plus recent detail"
      : "Recent detail only",
  };
}

export async function fetchApiUsageObservability(activeJobCount = 0): Promise<ApiUsageObservabilityViewModel> {
  const todayStart = startOfLocalDay();
  const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS);

  const [detailResult, rollupResult] = await Promise.all([
    supabase
      .from("api_usage_log")
      .select("service, function_name, endpoint, created_at, estimated_cost_cents, tokens_used")
      .gte("created_at", weekStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(API_USAGE_LIMIT),
    supabase
      .from("api_usage_daily_rollups" as any)
      .select("day, service, function_name, endpoint, call_count, total_cost_cents, tokens_total")
      .gte("day", isoDay(weekStart))
      .order("day", { ascending: true })
      .limit(API_USAGE_LIMIT),
  ]);

  if (detailResult.error) throw detailResult.error;
  if (rollupResult.error) throw rollupResult.error;

  return buildViewModel(
    (detailResult.data ?? []) as ApiUsageDetailRow[],
    (rollupResult.data ?? []) as ApiUsageRollupRow[],
    activeJobCount,
  );
}

export async function fetchApiUsageMetrics(): Promise<ApiUsageMetricsResult> {
  const viewModel = await fetchApiUsageObservability();
  return viewModel.metrics;
}

export async function fetchApiUsageHourly(): Promise<ApiUsageHourlyResult> {
  const todayStart = startOfLocalDay();
  const { data, error } = await supabase
    .from("api_usage_log")
    .select("service, function_name, endpoint, created_at, estimated_cost_cents, tokens_used")
    .gte("created_at", todayStart.toISOString())
    .limit(API_USAGE_LIMIT);

  if (error) throw error;

  return buildHourlyFromRows((data ?? []) as ApiUsageDetailRow[]);
}

export async function fetchApiCostAlerts(activeJobCount = 0): Promise<ApiCostAlertsResult> {
  const windowStart = getApiCostWindowStart();
  const { data, error } = await supabase
    .from("api_usage_log")
    .select("service, function_name, endpoint, created_at, estimated_cost_cents, tokens_used")
    .gte("created_at", windowStart.toISOString())
    .limit(API_USAGE_LIMIT);

  if (error) throw error;

  return buildAlertsFromRows((data ?? []) as ApiUsageDetailRow[], windowStart, activeJobCount);
}

export function useApiUsageObservability(activeJobCount = 0) {
  return useQuery({
    queryKey: [...apiUsageObservabilityQueryKey, activeJobCount],
    queryFn: () => fetchApiUsageObservability(activeJobCount),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
