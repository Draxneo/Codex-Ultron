/**
 * TechMySchedule.tsx — HCP-style daily schedule for technicians.
 *
 * Renders the SAME card spec as the dispatch board (JobScheduleCard) so techs
 * and dispatch see identical info. Reuses useTechDashboardData RPC.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays, subDays, isToday, isSameDay, startOfWeek, eachDayOfInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { useTechDashboardData, useTechDashboardRealtime } from "@/hooks/useTechDashboardData";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import { WeatherBadge } from "@/components/weather/WeatherBadge";
import { JobScheduleCard } from "@/components/job/JobScheduleCard";
// Travel times come from useTechDashboardData's RPC (route_travel_cache, populated
// by Navigate/OMW). Avoid useTechDayTravelTimes — that hook is disabled by cost guard.
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// Tech lane colors mirror DayCalendarBoard
const TECH_HEX_PALETTE = [
  "#0d7377", "#1e3a5f", "#8b7d3c", "#1b1b6b", "#c0392b",
  "#2e7d32", "#6a1b9a", "#d84315", "#00695c", "#4e342e",
];
const UNASSIGNED_COLOR = "#64748b";

export default function TechMySchedule() {
  const { employeeId } = useEffectiveAuth();
  const { data: employees } = useEmployees();
  const navigate = useNavigate();
  useTechDashboardRealtime();

  const [currentDay, setCurrentDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const currentEmployee = useMemo(() => {
    if (!employeeId || !employees) return null;
    return employees.find((e) => e.id === employeeId) || null;
  }, [employeeId, employees]);

  const employeeName = currentEmployee?.name || null;
  const dateStr = format(currentDay, "yyyy-MM-dd");
  const prevDateStr = format(subDays(currentDay, 1), "yyyy-MM-dd");
  const nextDateStr = format(addDays(currentDay, 1), "yyyy-MM-dd");

  // Match the tech's lane color from the dispatch board palette
  const techColor = useMemo(() => {
    if (!employeeName || !employees) return UNASSIGNED_COLOR;
    const idx = employees.findIndex(e => e.name === employeeName);
    return idx >= 0 ? TECH_HEX_PALETTE[idx % TECH_HEX_PALETTE.length] : UNASSIGNED_COLOR;
  }, [employeeName, employees]);

  const { data, isLoading } = useTechDashboardData(employeeName, dateStr);
  // Pre-fetch adjacent days for snappy nav
  useTechDashboardData(employeeName, prevDateStr);
  useTechDashboardData(employeeName, nextDateStr);

  // Shared 10-day forecast cache (same source dispatch uses)
  const { data: forecastMap } = useWeatherForecast();
  const forecast = forecastMap?.get(dateStr);

  // Customer phone fallback (cached via React Query)
  const customerIds = useMemo(() => {
    if (!data) return [] as string[];
    const ids = new Set<string>();
    for (const j of data.jobs) if (j.customer_id) ids.add(j.customer_id);
    for (const e of data.estimates) if (e.customer_id) ids.add(e.customer_id);
    return Array.from(ids).sort();
  }, [data]);

  const { data: phoneMap = new Map<string, string>() } = useQuery({
    queryKey: ["tech-schedule-phones", customerIds],
    enabled: customerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("customers")
        .select("id, phone, mobile_phone")
        .in("id", customerIds);
      const m = new Map<string, string>();
      for (const c of rows || []) {
        const ph = c.mobile_phone || c.phone;
        if (ph) m.set(c.id, ph);
      }
      return m;
    },
  });

  const items = useMemo(() => {
    if (!data) return [];
    const arr: any[] = [];
    for (const j of data.jobs) arr.push({ ...j, _itemType: "job" as const });
    for (const e of data.estimates)
      arr.push({ ...e, _itemType: "estimate" as const, job_type: "estimate" });
    arr.sort((a, b) => (a.arrival_start || "").localeCompare(b.arrival_start || ""));
    return arr;
  }, [data]);

  // Pre-cached drive legs come from the same RPC (route_travel_cache rows).
  const travelMap = data?.travelMap ?? new Map();

  // Per-day job counts for the visible week — one lightweight query
  const weekStartStr = format(startOfWeek(currentDay, { weekStartsOn: 0 }), "yyyy-MM-dd");
  const weekEndStr = format(addDays(startOfWeek(currentDay, { weekStartsOn: 0 }), 6), "yyyy-MM-dd");
  const { data: weekCounts } = useQuery({
    queryKey: ["tech-week-counts", employeeName, weekStartStr],
    enabled: !!employeeName,
    // Mirror the day-list RPC filters exactly so badge counts match the cards shown.
    // staleTime:0 + 30s refetchInterval = self-healing if a realtime event is dropped.
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    queryFn: async () => {
      const counts = new Map<string, number>();
      const [jobsRes, estRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("scheduled_date, assigned_to, status")
          .gte("scheduled_date", weekStartStr)
          .lte("scheduled_date", weekEndStr)
          .eq("assigned_to", employeeName!)
          .not("status", "in", "(canceled)"),
        supabase
          .from("estimates")
          .select("scheduled_date, assigned_to, status")
          .gte("scheduled_date", weekStartStr)
          .lte("scheduled_date", weekEndStr)
          .eq("assigned_to", employeeName!)
          .not("status", "in", "(canceled,lost)"),
      ]);
      for (const r of jobsRes.data || []) {
        if (r.scheduled_date) counts.set(r.scheduled_date, (counts.get(r.scheduled_date) || 0) + 1);
      }
      for (const r of estRes.data || []) {
        if (r.scheduled_date) counts.set(r.scheduled_date, (counts.get(r.scheduled_date) || 0) + 1);
      }
      return counts;
    },
  });

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCurrentDay(d);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky 7-day strip — arrows page by week (Sun→Sat) */}
      <div className="sticky top-0 z-10 flex items-center gap-1 px-2 py-2 bg-card border-b border-border shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setCurrentDay(subDays(currentDay, 7))}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 grid grid-cols-7 gap-1">
          {eachDayOfInterval({
            start: startOfWeek(currentDay, { weekStartsOn: 0 }),
            end: addDays(startOfWeek(currentDay, { weekStartsOn: 0 }), 6),
          }).map((day) => {
            const selected = isSameDay(day, currentDay);
            const today = isToday(day);
            const dayKey = format(day, "yyyy-MM-dd");
            const count = weekCounts?.get(dayKey) ?? 0;
            return (
              <button
                key={day.toISOString()}
                onClick={() => setCurrentDay(day)}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-lg py-1.5 transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : today
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="text-[10px] uppercase tracking-wider leading-tight">
                  {format(day, "EEE")}
                </span>
                <span className="text-base font-bold leading-tight">{format(day, "d")}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm ring-2 ring-card",
                      "bg-destructive text-destructive-foreground",
                    )}
                    aria-label={`${count} job${count === 1 ? "" : "s"} scheduled`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setCurrentDay(addDays(currentDay, 7))}
          aria-label="Next week"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Weather strip — same forecast source as dispatch board */}
      {forecast && (
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2 border-b",
            forecast.business_hours_rain
              ? "bg-blue-500/10 border-blue-200 dark:border-blue-900"
              : "bg-muted/40 border-border",
          )}
        >
          <WeatherBadge forecast={forecast} />
          {forecast.summary && (
            <span className="text-xs text-muted-foreground truncate flex-1">
              {forecast.summary}
            </span>
          )}
        </div>
      )}

      {/* Job list — uses shared JobScheduleCard so techs see exactly what dispatch sees */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-24 space-y-2 max-w-3xl mx-auto w-full">
        {isLoading && !data ? (
          <>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </>
        ) : items.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No jobs scheduled for {isToday(currentDay) ? "today" : format(currentDay, "EEEE")}</p>
          </Card>
        ) : (
          items.map((job) => {
            const phone = job.customer_phone || (job.customer_id && phoneMap.get(job.customer_id)) || null;
            const linkTo = job._itemType === "estimate" ? `/estimates/${job.id}` : `/tech/jobs/${job.id}`;
            const leg = travelMap.get(job.id);

            return (
              <div key={`${job._itemType}-${job.id}`} className="min-h-[120px]">
                <JobScheduleCard
                  item={{ ...job, customer_phone: phone, item_type: job._itemType }}
                  techColor={techColor}
                  routeInfo={leg}
                  onClick={() => navigate(linkTo)}
                />
              </div>
            );
          })
        )}
      </div>

      {/* FAB to today */}
      {!isToday(currentDay) && (
        <button
          type="button"
          onClick={goToday}
          className="fixed bottom-20 right-4 z-20 h-12 px-4 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center gap-2 active:scale-95 transition-transform font-medium text-sm"
        >
          <Calendar className="h-4 w-4" /> Today
        </button>
      )}
    </div>
  );
}
