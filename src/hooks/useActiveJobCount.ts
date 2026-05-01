import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";

/**
 * Counts today's scheduled work on the board, used as a denominator
 * for "expected API calls per job/estimate" math.
 */
async function fetchActiveJobCount(): Promise<number> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const { count: jobCount, error: jobsError } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("scheduled_date", todayStr)
    .not("status", "in", CLOSED_WORK_STATUS_FILTER);
  if (jobsError) throw jobsError;

  const { count: estimateCount, error: estimatesError } = await supabase
    .from("estimates")
    .select("id", { count: "exact", head: true })
    .eq("scheduled_date", todayStr)
    .not("status", "in", "(canceled,done,converted,rejected)");
  if (estimatesError) throw estimatesError;

  return (jobCount || 0) + (estimateCount || 0);
}

export function useActiveJobCount() {
  return useQuery({
    queryKey: ["active-job-count-today"],
    queryFn: fetchActiveJobCount,
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });
}
