/**
 * TechDashboard.tsx — Mobile-first "My Jobs" view for technicians
 *
 * PERFORMANCE: Uses a single `get_tech_dashboard_data` RPC per day instead of
 * 4 separate queries. Selected day + adjacent days pre-fetched for instant switching.
 *
 * WEEK VIEW: Full 7-day week picker with week cycling arrows, matching the
 * dispatcher's Jobs page experience.
 */

import { useState, useMemo, useEffect } from "react";

import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { useTechDashboardData, useTechDashboardRealtime } from "@/hooks/useTechDashboardData";
import { format, addDays, subDays, startOfWeek, endOfWeek, isSameDay, isToday, eachDayOfInterval } from "date-fns";
import { Phone, MapPin, ChevronRight, ChevronLeft, Clock, Car, MessageSquare, Navigation } from "lucide-react";
import { launchNavigation } from "@/lib/launchNavigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getStageInfo } from "@/hooks/useWorkflowStage";
import { useQueryClient } from "@tanstack/react-query";
import { OnMyWayButton } from "@/components/OnMyWayButton";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";

/* ── Card color system ── */

const cardBgColors: Record<string, string> = {
  install: "bg-card border border-primary/25 shadow-[inset_3px_0_0_hsl(var(--primary))]",
  service: "bg-card border border-[hsl(var(--today))]/25 shadow-[inset_3px_0_0_hsl(var(--today))]",
  maintenance: "bg-card border border-[hsl(var(--complete))]/25 shadow-[inset_3px_0_0_hsl(var(--complete))]",
  estimate: "bg-card border border-purple-300/30 shadow-[inset_3px_0_0_rgb(147,51,234)]",
  phone_call: "bg-card border border-sky-300/25 shadow-[inset_3px_0_0_hsl(199_89%_48%)]",
};

const cardSolidColors: Record<string, string> = {
  install: "bg-primary text-primary-foreground",
  service: "bg-[hsl(var(--today))] text-white",
  maintenance: "bg-[hsl(var(--complete))] text-white",
  estimate: "bg-purple-600 text-white",
  phone_call: "bg-sky-500 text-white",
};

function typeLabel(jt: string) {
  switch (jt) {
    case "install": return "INST";
    case "maintenance": return "MAINT";
    case "estimate": return "EST";
    case "phone_call": return "📞 CALL";
    default: return "SERV";
  }
}

/* ── Main Component ── */

export default function TechDashboard() {
  const { employeeId } = useEffectiveAuth();
  const { data: employees } = useEmployees();
  const queryClient = useQueryClient();
  const softphone = useSoftphoneContext();
  useTechDashboardRealtime();

  const [currentDay, setCurrentDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const weekStart = useMemo(() => startOfWeek(currentDay, { weekStartsOn: 0 }), [currentDay]);
  const weekEnd = useMemo(() => endOfWeek(currentDay, { weekStartsOn: 0 }), [currentDay]);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const currentEmployee = useMemo(() => {
    if (!employeeId || !employees) return null;
    return employees.find((e) => e.id === employeeId) || null;
  }, [employeeId, employees]);

  const employeeName = currentEmployee?.name || null;
  const employeeHomeAddress = (currentEmployee as any)?.home_address || null;

  const currentDateStr = format(currentDay, "yyyy-MM-dd");

  // Pre-fetch surrounding days for smooth switching
  const prevDateStr = format(subDays(currentDay, 1), "yyyy-MM-dd");
  const nextDateStr = format(addDays(currentDay, 1), "yyyy-MM-dd");

  const { data: currentDayData, isLoading } = useTechDashboardData(employeeName, currentDateStr);
  useTechDashboardData(employeeName, prevDateStr);
  useTechDashboardData(employeeName, nextDateStr);

  // Also pre-fetch all week days for badge counts
  const weekDateStrs = useMemo(() => weekDays.map(d => format(d, "yyyy-MM-dd")), [weekDays]);
  const d0 = useTechDashboardData(employeeName, weekDateStrs[0]);
  const d1 = useTechDashboardData(employeeName, weekDateStrs[1]);
  const d2 = useTechDashboardData(employeeName, weekDateStrs[2]);
  const d3 = useTechDashboardData(employeeName, weekDateStrs[3]);
  const d4 = useTechDashboardData(employeeName, weekDateStrs[4]);
  const d5 = useTechDashboardData(employeeName, weekDateStrs[5]);
  const d6 = useTechDashboardData(employeeName, weekDateStrs[6]);
  const weekData = [d0.data, d1.data, d2.data, d3.data, d4.data, d5.data, d6.data];

  // Build a phone lookup map from linked customer records
  const customerIds = useMemo(() => {
    if (!currentDayData) return [];
    const ids = new Set<string>();
    for (const j of currentDayData.jobs) if (j.customer_id) ids.add(j.customer_id);
    for (const e of currentDayData.estimates) if (e.customer_id) ids.add(e.customer_id);
    return Array.from(ids);
  }, [currentDayData]);

  const [customerPhoneMap, setCustomerPhoneMap] = useState<Map<string, string>>(new Map());
  
  // Fetch customer phones for fallback
  useEffect(() => {
    if (customerIds.length === 0) return;
    supabase
      .from("customers")
      .select("id, phone, mobile_phone")
      .in("id", customerIds)
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, string>();
        for (const c of data) {
          const ph = c.mobile_phone || c.phone;
          if (ph) map.set(c.id, ph);
        }
        setCustomerPhoneMap(map);
      });
  }, [customerIds]);

  // Build unified items list from the selected day's RPC data
  const dayItems = useMemo(() => {
    if (!currentDayData) return [];
    const items: Array<any & { _itemType: "job" | "estimate" }> = [];

    for (const j of currentDayData.jobs) {
      items.push({ ...j, _itemType: "job" as const });
    }
    for (const e of currentDayData.estimates) {
      items.push({
        ...e,
        _itemType: "estimate" as const,
        job_type: "estimate",
        job_number: null,
        hcp_job_number: null,
        customer_id: e.customer_id,
      });
    }

    items.sort((a, b) => (a.arrival_start || "").localeCompare(b.arrival_start || ""));
    return items;
  }, [currentDayData]);

  const routeInfo = currentDayData?.travelMap || new Map();

  const goToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCurrentDay(d);
  };

  if (isLoading && !currentDayData) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Week picker — matches dispatcher Jobs page */}
      <div className="flex flex-col border-b bg-card shrink-0">
        {/* Week nav row */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentDay(subDays(currentDay, 7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentDay(addDays(currentDay, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-xs font-semibold text-foreground">
            {format(weekStart, "MMMM d")}–{format(weekEnd, "d, yyyy")}
          </span>
          {!isToday(currentDay) ? (
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={goToToday}>Today</Button>
          ) : (
            <div className="w-12" />
          )}
        </div>
        {/* Day buttons */}
        <div className="flex items-center gap-1 px-3 pb-2">
          {weekDays.map((day, idx) => {
            const dd = weekData[idx];
            const count = (dd?.jobs?.length || 0) + (dd?.estimates?.length || 0);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setCurrentDay(day)}
                className={cn(
                  "flex flex-col items-center px-1 py-1.5 rounded-lg text-xs transition-colors min-w-[40px] min-h-[44px] justify-center flex-1 relative",
                  isSameDay(day, currentDay) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  isToday(day) && !isSameDay(day, currentDay) && "ring-1 ring-primary/50"
                )}
              >
                <span className="text-[10px] uppercase">{format(day, "EEE")}</span>
                <span className="text-sm font-bold">{format(day, "d")}</span>
                {count > 0 && !isSameDay(day, currentDay) && (
                  <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-accent text-accent-foreground text-[8px] font-bold flex items-center justify-center">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day label */}
      <div className="flex items-center px-4 py-1.5 border-b bg-card/50 shrink-0">
        <span className="text-xs font-semibold text-foreground">
          {isToday(currentDay) ? "Today" : format(currentDay, "EEEE")}, {format(currentDay, "MMM d")}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{dayItems.length} job{dayItems.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Job list */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 max-w-3xl mx-auto w-full">
        {dayItems.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <div className="text-3xl mb-2">📋</div>
            No jobs scheduled for {isToday(currentDay) ? "today" : format(currentDay, "EEEE")}
          </Card>
        ) : (
          dayItems.map((job) => {
            const ro = routeInfo.get(job.id);
            const address = job.address || null;
            const phone = job.customer_phone || (job.customer_id ? customerPhoneMap.get(job.customer_id) : null) || null;
            const isEstimate = job._itemType === "estimate";
            const formToken = employeeId ? `${job.id}__${employeeId}` : null;

            // For estimates, map work_status → status so the workflow engine reads it correctly
            const stageJob = isEstimate ? { ...job, status: job.work_status || "new" } : job;
            const si = getStageInfo(stageJob as any);

            let timeRange: string | null = null;
            try {
              if (job.arrival_start) {
                const s = format(new Date(job.arrival_start), "h:mm");
                const e = job.arrival_end ? format(new Date(job.arrival_end), "h:mma").toLowerCase() : null;
                timeRange = e ? `${s}-${e}` : s;
              }
            } catch {}

            return (
              <div key={job.id} className="space-y-0">
                {ro?.travelMin != null ? (
                  <div className="flex items-center justify-center gap-1.5 py-1.5 text-xs">
                    <Car className={cn(
                      "h-3.5 w-3.5",
                      ro.travelMin <= 10 ? "text-[hsl(var(--complete))]" : ro.travelMin <= 20 ? "text-amber-500" : "text-destructive"
                    )} />
                    <span className={cn(
                      "font-semibold",
                      ro.travelMin <= 10 ? "text-[hsl(var(--complete))]" : ro.travelMin <= 20 ? "text-amber-500" : "text-destructive"
                    )}>
                      {ro.travelMin} min
                    </span>
                    {ro.fromLabel && <span className="text-muted-foreground">from {ro.fromLabel}</span>}
                  </div>
                ) : null}

                <Link to={formToken ? `/form/${formToken}` : (isEstimate ? `/estimates/${job.id}` : `/jobs/${job.id}`)} className="block">
                  <Card className={cn(
                    "p-3 hover:shadow-md transition-shadow active:scale-[0.98] rounded-lg",
                    cardBgColors[job.job_type || "service"] || "bg-card border"
                  )}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {ro && (
                        <span className="w-5 h-5 rounded-full bg-foreground/80 text-background text-[10px] font-bold flex items-center justify-center shrink-0">
                          {ro.order}
                        </span>
                      )}
                      <span className={cn(
                        "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide",
                        cardSolidColors[job.job_type || "service"]
                      )}>
                        {typeLabel(job.job_type || "service")}
                      </span>
                      <span className="text-[11px] text-foreground/80 font-semibold">
                        {isEstimate
                          ? (job.estimate_number && `#${job.estimate_number}`)
                          : ((job.job_number || job.hcp_job_number) && `#${job.job_number || job.hcp_job_number}`)}
                      </span>
                      {timeRange && (
                        <span className="ml-auto flex items-center gap-0.5 text-[11px] text-foreground/70 font-semibold shrink-0">
                          <Clock className="h-3 w-3" />
                          {timeRange}
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-bold text-foreground leading-tight mb-1">
                      {job.customer_name || "Unknown Customer"}
                    </div>

                    {address && (
                      <p className="text-xs text-foreground/70 font-medium truncate mb-2">{address}</p>
                    )}

                    <div className="flex items-center gap-2 mt-1">
                      {si.isComplete ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs bg-[hsl(var(--complete)/0.15)] text-[hsl(var(--complete))]">
                          ✓ Complete
                        </span>
                      ) : (
                        <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                          {/* Communication group */}
                          <div className="flex gap-2">
                            {!si.isComplete && phone && (
                              <OnMyWayButton
                                jobId={job.id}
                                customerPhone={phone}
                                customerName={job.customer_name}
                                jobAddress={address}
                                employeeAddress={employeeHomeAddress}
                                employeeName={employeeName}
                                employeeId={employeeId}
                                className="h-12 px-4 text-xs rounded-xl"
                              />
                            )}
                            {phone && (
                              <SmsButton
                                phone={phone}
                                className="h-12 min-w-[56px] px-4 rounded-xl border border-border bg-card flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                                iconClassName="h-5 w-5"
                              />
                            )}
                            {phone && (
                              <ClickToCall
                                phone={phone}
                                contactName={job.customer_name}
                                jobId={job.id}
                                className="h-12 min-w-[56px] px-4 rounded-xl border border-border bg-card flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                                iconClassName="h-5 w-5"
                              />
                            )}
                          </div>

                          {/* Spacer to prevent mis-taps */}
                          {address && <div className="w-4" />}

                          {/* Navigation — separated */}
                          {address && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                launchNavigation(address);
                              }}
                              className="h-12 min-w-[56px] px-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                            >
                              <Navigation className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex-1" />
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Card>
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
