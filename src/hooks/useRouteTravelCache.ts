import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RouteLeg {
  id: string;
  employee_id: string;
  scheduled_date: string;
  leg_order: number;
  from_address: string | null;
  to_address: string | null;
  from_job_id: string | null;
  to_job_id: string | null;
  from_label: string | null;
  travel_minutes: number | null;
  distance_miles: number | null;
  calculated_at: string;
}

/**
 * Fetch cached travel times for a given employee + date.
 * Returns a Map<jobId, { order, travelMin, fromLabel }> for easy lookup.
 */
export function useRouteTravelCache(employeeId: string | null, date: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["route_travel_cache", employeeId, date],
    enabled: !!employeeId && !!date,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_travel_cache")
        .select("*")
        .eq("employee_id", employeeId!)
        .eq("scheduled_date", date!)
        .order("leg_order");

      if (error) throw error;
      return (data || []) as RouteLeg[];
    },
  });

  useEffect(() => {
    if (!employeeId || !date) return;

    const channel = supabase
      .channel(`route_travel_cache:${employeeId}:${date}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "route_travel_cache",
          filter: `employee_id=eq.${employeeId}`,
        },
        (payload) => {
          const changedDate = (payload.new as { scheduled_date?: string } | null)?.scheduled_date
            ?? (payload.old as { scheduled_date?: string } | null)?.scheduled_date;
          if (changedDate === date) {
            queryClient.invalidateQueries({ queryKey: ["route_travel_cache", employeeId, date] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date, employeeId, queryClient]);

  const routeMap = buildRouteMap(query.data);

  return {
    ...query,
    routeMap,
  };
}

/**
 * Fetch cached travel times for ALL employees on a given date.
 * Used by the dispatch board (Jobs.tsx) which shows all techs.
 */
export function useRouteTravelCacheForDate(date: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["route_travel_cache_date", date],
    enabled: !!date,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_travel_cache")
        .select("*")
        .eq("scheduled_date", date!)
        .order("leg_order");

      if (error) throw error;
      return (data || []) as RouteLeg[];
    },
  });

  useEffect(() => {
    if (!date) return;

    const channel = supabase
      .channel(`route_travel_cache:date:${date}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "route_travel_cache",
        },
        (payload) => {
          const changedDate = (payload.new as { scheduled_date?: string } | null)?.scheduled_date
            ?? (payload.old as { scheduled_date?: string } | null)?.scheduled_date;
          if (changedDate === date) {
            queryClient.invalidateQueries({ queryKey: ["route_travel_cache_date", date] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date, queryClient]);

  const routeMap = buildRouteMap(query.data);

  return {
    ...query,
    routeMap,
  };
}

function buildRouteMap(data: RouteLeg[] | undefined) {
  const routeMap = new Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>();
  if (data) {
    for (const leg of data) {
      if (leg.to_job_id) {
        routeMap.set(leg.to_job_id, {
          order: leg.leg_order + 1,
          travelMin: leg.travel_minutes,
          fromLabel: leg.from_label,
        });
      }
    }
  }
  return routeMap;
}

/**
 * Fetch cached travel times for a week range (7 days).
 * Returns the same Map shape as useRouteTravelCacheForDate but across all days.
 */
export function useRouteTravelCacheForWeek(startDate: string | null, endDate: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["route_travel_cache_week", startDate, endDate],
    enabled: !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("route_travel_cache")
        .select("*")
        .gte("scheduled_date", startDate!)
        .lte("scheduled_date", endDate!)
        .order("leg_order");

      if (error) throw error;
      return (data || []) as RouteLeg[];
    },
  });

  useEffect(() => {
    if (!startDate || !endDate) return;

    const channel = supabase
      .channel(`route_travel_cache:week:${startDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "route_travel_cache" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["route_travel_cache_week", startDate, endDate] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [startDate, endDate, queryClient]);

  const routeMap = buildRouteMap(query.data);

  return { ...query, routeMap };
}
