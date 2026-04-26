import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useRef, useCallback, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TechDashboardData {
  jobs: any[];
  estimates: any[];
  travelMap: Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>;
}

/**
 * Single RPC call that returns jobs + estimates + travel legs for one tech + date.
 */
export function useTechDashboardData(employeeName: string | null, date: string | null) {
  return useQuery({
    queryKey: ["tech_dashboard_data", employeeName, date],
    enabled: !!employeeName && !!date,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tech_dashboard_data" as any, {
        p_employee_name: employeeName,
        p_date: date,
      });
      if (error) throw error;

      const result = data as any;
      const jobs = result?.jobs || [];
      const estimates = result?.estimates || [];
      const travelLegs = result?.travel_legs || [];

      const travelMap = new Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>();
      for (const leg of travelLegs) {
        if (leg.to_job_id) {
          travelMap.set(leg.to_job_id, {
            order: leg.leg_order + 1,
            travelMin: leg.travel_minutes,
            fromLabel: leg.from_label,
          });
        }
      }

      return { jobs, estimates, travelMap } as TechDashboardData;
    },
  });
}

/**
 * Subscribes to Realtime changes on jobs, estimates, and route_travel_cache.
 * Uses debounced invalidation to prevent flicker from bulk cron updates.
 */
export function useTechDashboardRealtime() {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Unique per hook instance — prevents two mounts of this hook from
  // colliding on the same channel name (which causes silent dropped subs).
  const instanceId = useId();

  const debouncedInvalidate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["tech_dashboard_data"] });
      qc.invalidateQueries({ queryKey: ["tech-week-counts"] });
    }, 500);
  }, [qc]);

  useEffect(() => {
    const channel = supabase
      .channel(`tech-dashboard-live-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, debouncedInvalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "estimates" }, debouncedInvalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "route_travel_cache" }, debouncedInvalidate)
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [qc, debouncedInvalidate, instanceId]);
}
