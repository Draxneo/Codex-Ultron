import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Counts jobs scheduled for today (active board), used as a denominator
 * for "expected API calls per job" math.
 */
async function fetchActiveJobCount(): Promise<number> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("scheduled_date", todayStr)
    .not("status", "in", "(canceled,done,invoiced)");
  if (error) throw error;
  return count || 0;
}

export function useActiveJobCount() {
  return useQuery({
    queryKey: ["active-job-count-today"],
    queryFn: fetchActiveJobCount,
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });
}
