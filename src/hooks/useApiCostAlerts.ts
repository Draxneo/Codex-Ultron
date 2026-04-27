import { useQuery } from "@tanstack/react-query";
import {
  fetchApiCostAlerts,
  type ApiCostAlertsResult,
  type ServiceUsageStatus,
} from "@/hooks/useApiUsageObservability";

export type { ApiCostAlertsResult, ServiceUsageStatus };

export function useApiCostAlerts(activeJobCount = 0) {
  return useQuery({
    queryKey: ["api-cost-alerts", activeJobCount],
    queryFn: () => fetchApiCostAlerts(activeJobCount),
    refetchInterval: 60_000, // poll every minute
    staleTime: 30_000,
  });
}
