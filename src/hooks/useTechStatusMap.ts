import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export type TechStatus = "on_site" | "at_supply_house" | "en_route";

export interface TechStatusInfo {
  status: TechStatus;
  locationName: string | null;
}

function emptyStatusMap() {
  return new Map<string, TechStatusInfo>();
}

/**
 * Fetches today's latest tech_location_events per employee,
 * derives current status, and subscribes to realtime updates.
 * Returns Map<employeeId, TechStatusInfo>
 */
export function useTechStatusMapState() {
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const query = useQuery({
    queryKey: ["tech-status-map", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tech_location_events")
        .select("employee_id, event_type, location_name, created_at")
        .gte("created_at", `${today}T00:00:00`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data) return emptyStatusMap();

      const map = new Map<string, TechStatusInfo>();
      const seen = new Set<string>();

      for (const row of data) {
        if (seen.has(row.employee_id)) continue;
        seen.add(row.employee_id);

        const status = deriveStatus(row.event_type);
        if (status) {
          map.set(row.employee_id, {
            status,
            locationName: row.location_name,
          });
        }
      }
      return map;
    },
    refetchInterval: 60_000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("tech-status-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tech_location_events" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["tech-status-map", today] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, today]);

  return {
    ...query,
    statusMap: query.data ?? emptyStatusMap(),
  };
}

export function useTechStatusMap() {
  return useTechStatusMapState().statusMap;
}

function deriveStatus(eventType: string): TechStatus | null {
  switch (eventType) {
    case "job_arrival":
    case "estimate_arrival":
      return "on_site";
    case "supply_house_arrival":
      return "at_supply_house";
    case "job_departure":
    case "estimate_departure":
    case "supply_house_departure":
      return "en_route";
    default:
      return null;
  }
}
