import { useQuery } from "@tanstack/react-query";
import {
  fetchApiUsageHourly,
  type HourlyServicePoint,
} from "@/hooks/useApiUsageObservability";

export type { HourlyServicePoint };

export function useApiUsageHourly() {
  return useQuery({
    queryKey: ["api-usage-hourly"],
    queryFn: fetchApiUsageHourly,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
