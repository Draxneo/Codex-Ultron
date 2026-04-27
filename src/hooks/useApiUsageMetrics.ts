import { useQuery } from "@tanstack/react-query";
import {
  fetchApiUsageMetrics,
  type DailyTrend,
  type FunctionMetric,
  type ServiceMetric,
} from "@/hooks/useApiUsageObservability";

export type { DailyTrend, FunctionMetric, ServiceMetric };

export function useApiUsageMetrics() {
  return useQuery({
    queryKey: ["api-usage-metrics"],
    queryFn: fetchApiUsageMetrics,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
