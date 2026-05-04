/**
 * useTechDayTravelTimes — Computes drive times between a tech's jobs for a date.
 *
 * Hits the `calculate-travel-times` edge function (cached server-side via
 * directions_cache table, 7-day TTL). Returns a Map keyed by job_id → drive leg
 * (duration & distance from the previous stop).
 *
 * The first job's leg starts from the tech's home address.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TravelLeg {
  from: string;
  from_address: string;
  to: string;
  to_address: string;
  to_job_id: string;
  duration_minutes: number;
  distance_miles: number;
  traffic_condition: "light" | "normal" | "heavy" | "severe";
}

export interface TravelDay {
  total_drive_minutes: number;
  total_drive_miles: number;
  legs: TravelLeg[];
  /** job_id → leg arriving at that job */
  legByJobId: Map<string, TravelLeg>;
}

export function useTechDayTravelTimes(techName: string | null, dateStr: string, jobCount: number) {
  return useQuery<TravelDay | null>({
    queryKey: ["tech-day-travel", techName, dateStr],
    // COST GUARD: NEVER auto-fetch. This used to fire on every dispatcher view of any tech's
    // day, costing thousands of Google Maps calls. Travel times now come exclusively from
    // route_travel_cache (populated only when a tech presses "Navigate" / OMW). If the cache
    // is empty for the day, we return null and the UI hides the leg labels — no Google call.
    enabled: false,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-travel-times", {
        body: { tech_name: techName, date: dateStr },
      });
      if (error) throw error;
      if (!data || !Array.isArray(data.legs)) return null;
      const legByJobId = new Map<string, TravelLeg>();
      for (const leg of data.legs as TravelLeg[]) {
        if (leg.to_job_id) legByJobId.set(leg.to_job_id, leg);
      }
      return {
        total_drive_minutes: data.total_drive_minutes || 0,
        total_drive_miles: data.total_drive_miles || 0,
        legs: data.legs,
        legByJobId,
      };
    },
  });
}
