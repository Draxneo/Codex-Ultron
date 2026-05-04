import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logClientSystemError } from "@/lib/systemErrorLog";

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

interface SchedulableRouteItem {
  id: string;
  scheduled_date: string | null;
  assigned_to: string | null;
  address: string | null;
  status?: string | null;
}

interface EmployeeRouteOption {
  id: string;
  name: string | null;
  is_active?: boolean | null;
}

function formatLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isTodayOrTomorrow(date: string | null) {
  if (!date) return false;
  const today = formatLocalDate(new Date());
  const tomorrow = formatLocalDate(addLocalDays(new Date(), 1));
  return date === today || date === tomorrow;
}

function normalizeName(name: string | null | undefined) {
  return (name || "").trim().toLowerCase();
}

function isRouteActiveStatus(status?: string | null) {
  const text = String(status || "").toLowerCase();
  return !/\b(canceled|cancelled|lost|deleted|void|done|complete|completed|finished|closed|paid|invoiced|archived)\b/.test(text);
}

const globalAttemptedRouteKeys = new Set<string>();

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

/**
 * Populate missing travel-time cache rows for visible dispatch work.
 *
 * Cost guard:
 * - Only today + tomorrow.
 * - Only assigned jobs/estimates with addresses.
 * - Only employees whose visible jobs are missing route cache rows.
 * - One attempted calculation per unique missing set per browser session.
 */
export function useEnsureRouteTravelCacheForDate(
  date: string | null,
  dayItems: SchedulableRouteItem[],
  employees: EmployeeRouteOption[] | undefined,
  routeMap: Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>,
  cacheLoading: boolean
) {
  const queryClient = useQueryClient();
  const attemptedKeysRef = useRef<Set<string>>(new Set());

  const workToCache = useMemo(() => {
    if (!date || !isTodayOrTomorrow(date) || cacheLoading) return null;
    if (!employees?.length || !dayItems.length) return null;

    const employeeByName = new Map(
      employees
        .filter((employee) => employee.is_active !== false && employee.id && employee.name)
        .map((employee) => [normalizeName(employee.name), employee])
    );

    const missingEmployeeIds = new Set<string>();
    const missingItemIds: string[] = [];

    for (const item of dayItems) {
      if (item.scheduled_date !== date) continue;
      if (!item.assigned_to || !item.address) continue;
      if (!isRouteActiveStatus(item.status)) continue;
      if (routeMap.has(item.id)) continue;

      const employee = employeeByName.get(normalizeName(item.assigned_to));
      if (!employee?.id) continue;

      missingEmployeeIds.add(employee.id);
      missingItemIds.push(item.id);
    }

    if (missingEmployeeIds.size === 0) return null;

    const employeeIds = Array.from(missingEmployeeIds).sort();
    missingItemIds.sort();

    return {
      key: `${date}:${employeeIds.join(",")}:${missingItemIds.join(",")}`,
      batch: employeeIds.map((employee_id) => ({ employee_id, date })),
    };
  }, [cacheLoading, date, dayItems, employees, routeMap]);

  useEffect(() => {
    if (!workToCache) return;
    if (attemptedKeysRef.current.has(workToCache.key)) return;
    if (globalAttemptedRouteKeys.has(workToCache.key)) return;
    attemptedKeysRef.current.add(workToCache.key);
    globalAttemptedRouteKeys.add(workToCache.key);

    void supabase.functions.invoke("calculate-route-cache", {
      body: { batch: workToCache.batch },
    }).then(({ error }) => {
      if (error) {
        console.warn("[travel-cache] route calculation failed", error);
        void logClientSystemError({
          sourceName: "route-travel-cache",
          message: error.message || "Route cache calculation failed",
          severity: "warning",
          context: {
            date,
            batch: workToCache.batch,
            work_key: workToCache.key,
          },
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["route_travel_cache_date", date] });
      queryClient.invalidateQueries({ queryKey: ["route_travel_cache_week"] });
    });
  }, [date, queryClient, workToCache]);
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
