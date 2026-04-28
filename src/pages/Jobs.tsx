import { useState, useMemo, lazy, Suspense, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, Plus, Rows3, CalendarOff, CalendarRange, ListChecks, Palette, ArrowLeft, AlertTriangle } from "lucide-react";
import { DispatchBoard } from "@/components/job/DispatchBoard";
import { WeekCalendarBoard } from "@/components/job/WeekCalendarBoard";
import { DayCalendarBoard } from "@/components/job/DayCalendarBoard";
import { MobileDispatchList } from "@/components/job/MobileDispatchList";
import { RainDayAlertBar } from "@/components/weather/RainDayAlertBar";
import { BulkActionsBar } from "@/components/job/BulkActionsBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/AppHeader";
import { useJobs, useFollowUpJobs } from "@/hooks/useJobs";
import { useEstimates } from "@/hooks/useEstimates";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEmployees } from "@/hooks/useEmployees";
import { useSupplyHouseLocations } from "@/hooks/useSupplyHouseLocations";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getUsHolidayName } from "@/lib/usHolidays";
import { useTechFormRealtime } from "@/hooks/useTechFormRealtime";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const JobsMapView = lazy(() => import("@/components/JobsMapView"));

import { NewJobDialog } from "@/components/NewJobDialog";
import { NewEstimateDialog } from "@/components/NewEstimateDialog";
import { CalendarSettings, useCalendarSettings } from "@/components/job/CalendarSettings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  subDays,
  eachDayOfInterval,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const jobTypeBorderColors: Record<string, string> = {
  install: "border-l-primary",
  service: "border-l-[hsl(var(--today))]",
  maintenance: "border-l-[hsl(var(--complete))]",
  estimate: "border-l-purple-600",
  callback: "border-l-[hsl(var(--sky))]",
};

type FilterType = "all" | "estimate" | "install" | "service" | "maintenance";

interface BoardItem {
  id: string;
  item_type: "job" | "estimate";
  customer_name: string | null;
  customer_id: string | null;
  address: string | null;
  description: string | null;
  assigned_to: string | null;
  scheduled_date: string | null;
  job_type: string;
  hcp_job_number: string | null;
  job_number: string | null;
  hcp_customer_id: string | null;
  customer_phone: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  estimate_number?: string | null;
  work_status?: string | null;
  status?: string | null;
}

import { useEnsureRouteTravelCacheForDate, useRouteTravelCacheForDate, useRouteTravelCacheForWeek } from "@/hooks/useRouteTravelCache";

/** Map job_type to matching employee roles */
function getRolesForJobType(jobType: string): string[] {
  switch (jobType) {
    case "install": return ["install_tech", "admin"];
    case "service": case "maintenance": return ["service_tech", "admin"];
    case "estimate": return ["sales_tech", "service_tech", "admin"];
    default: return ["service_tech", "install_tech", "sales_tech", "admin"];
  }
}

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "estimate", label: "Estimates" },
  { value: "install", label: "Install" },
  { value: "service", label: "Service" },
  { value: "maintenance", label: "Maint" },
];

const Jobs = () => {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const attentionFilter = searchParams.get("attention");
  const typeParam = searchParams.get("type") as FilterType | null;
  const { data: jobs, isLoading } = useJobs();
  const { data: estimates, isLoading: estLoading } = useEstimates(true);
  const { data: employees } = useEmployees();
  const { role } = useAuth();
  const { locations: supplyHouseLocations } = useSupplyHouseLocations();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [viewMode, setViewMode] = useState<"week" | "day" | "dispatch" | "map">("week");
  const [colorBy, setColorBy] = useState<"employee" | "area">("employee");
  const { settings: calSettings, update: setCalSettings } = useCalendarSettings();
  const [mapRange, setMapRange] = useState<"today" | "week">("today");
  const [currentDay, setCurrentDay] = useState(() => new Date());
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobDate, setNewJobDate] = useState<string | undefined>();
  const [newEstimateOpen, setNewEstimateOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useTechFormRealtime();
  const { data: followUpJobs = [] } = useFollowUpJobs();

  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam) return;
    const parsed = parseISO(dateParam);
    if (!Number.isNaN(parsed.getTime())) setCurrentDay(parsed);
  }, [searchParams]);

  useEffect(() => {
    if (typeParam && FILTERS.some((filter) => filter.value === typeParam)) {
      setTypeFilter(typeParam);
    }
  }, [typeParam]);
  const doneStatuses = ["done", "invoiced", "canceled", "completed"];
  const queueCount = useMemo(() => {
    const unschedCount = (jobs || []).filter(j => !j.scheduled_date && !doneStatuses.includes(j.status?.toLowerCase?.() ?? "")).length;
    const unschedIds = new Set((jobs || []).filter(j => !j.scheduled_date).map(j => j.id));
    const fuCount = followUpJobs.filter(j => !unschedIds.has(j.id)).length;
    return unschedCount + fuCount;
  }, [jobs, followUpJobs]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const boardItems = useMemo<BoardItem[]>(() => {
    const items: BoardItem[] = [];

    (jobs || []).forEach(job => {
      items.push({
        ...job,
        item_type: "job",
        customer_id: (job as any).customer_id || null,
        job_type: job.job_type || "service",
        job_number: (job as any).job_number || job.hcp_job_number,
        arrival_start: (job as any).arrival_start || null,
        arrival_end: (job as any).arrival_end || null,
      } as BoardItem);
    });

    // Deduplicate: skip estimates whose hcp_id already exists as a REAL job
    // (not ghost rows where job_type='estimate' — those are stale sync artifacts)
    const realJobHcpIds = new Set(
      (jobs || [])
        .filter(j => (j as any).hcp_id && (j as any).job_type !== 'estimate')
        .map(j => (j as any).hcp_id)
    );
    (estimates || []).forEach(est => {
      const estHcpId = (est as any).hcp_id;
      if (estHcpId && realJobHcpIds.has(estHcpId)) return; // already shown as a converted job
      items.push({
        ...est,
        item_type: "estimate",
        customer_id: (est as any).customer_id || null,
        job_type: "estimate",
        hcp_job_number: null,
        job_number: null,
        arrival_start: (est as any).arrival_start || null,
        arrival_end: (est as any).arrival_end || null,
      } as BoardItem);
    });

    return items;
  }, [jobs, estimates]);

  const filteredItems = useMemo(() => {
    const searchLower = search.toLowerCase();
    const includesSearch = (value?: string | number | null) =>
      String(value || "").toLowerCase().includes(searchLower);
    return boardItems.filter((item) => {
      // Hide cancelled jobs/estimates from dispatch board
      if (item.work_status?.toLowerCase() === "cancelled" || item.work_status?.toLowerCase() === "canceled") return false;
      if (item.status?.toLowerCase() === "cancelled" || item.status?.toLowerCase() === "canceled") return false;
      if (typeFilter !== "all") {
        if (typeFilter === "estimate" && item.item_type !== "estimate") return false;
        if (typeFilter !== "estimate" && (item.item_type === "estimate" || item.job_type !== typeFilter)) return false;
      }
      if (search) {
        return (
          includesSearch(item.customer_name) ||
          includesSearch(item.job_number) ||
          includesSearch(item.hcp_job_number) ||
          includesSearch(item.address) ||
          includesSearch((item as any).estimate_number)
        );
      }
      return true;
    });
  }, [boardItems, search, typeFilter]);

  const currentDayItems = useMemo(() => {
    const items = filteredItems.filter((item) => {
      if (!item.scheduled_date) return false;
      return isSameDay(parseISO(item.scheduled_date), currentDay);
    });
    items.sort((a, b) => {
      if (a.arrival_start && b.arrival_start) return a.arrival_start.localeCompare(b.arrival_start);
      if (a.arrival_start) return -1;
      if (b.arrival_start) return 1;
      return 0;
    });
    return items;
  }, [filteredItems, currentDay]);

  const weekItems = useMemo(() => {
    const ws = startOfWeek(currentDay, { weekStartsOn: 0 });
    const we = endOfWeek(currentDay, { weekStartsOn: 0 });
    return filteredItems.filter(item => {
      if (!item.scheduled_date) return false;
      const d = parseISO(item.scheduled_date);
      return d >= ws && d <= we;
    });
  }, [filteredItems, currentDay]);

  const weekCarouselItems = useMemo(() => {
    const weeksBefore = 4;
    const weeksAfter = 4;
    const ws = startOfWeek(addDays(currentDay, -weeksBefore * 7), { weekStartsOn: 0 });
    const we = endOfWeek(addDays(currentDay, weeksAfter * 7), { weekStartsOn: 0 });
    return filteredItems.filter(item => {
      if (!item.scheduled_date) return false;
      const d = parseISO(item.scheduled_date);
      return d >= ws && d <= we;
    });
  }, [filteredItems, currentDay]);

  const goToToday = () => {
    setCurrentDay(new Date());
  };

  const handleItemClick = (item: BoardItem) => {
    if (item.item_type === "estimate") {
      navigate(`/estimates/${item.id}`);
    } else {
      navigate(`/jobs/${item.id}`);
    }
  };

  const loading = isLoading || estLoading;
  const currentDateStr = useMemo(() => format(currentDay, "yyyy-MM-dd"), [currentDay]);
  const currentTravelCache = useRouteTravelCacheForDate(currentDateStr);
  const { routeMap: dispatchRouteOrders } = currentTravelCache;

  const tomorrowDateStr = useMemo(() => format(addDays(new Date(), 1), "yyyy-MM-dd"), []);
  const tomorrowItems = useMemo(
    () => filteredItems.filter((item) => item.scheduled_date === tomorrowDateStr),
    [filteredItems, tomorrowDateStr]
  );
  const tomorrowTravelCache = useRouteTravelCacheForDate(tomorrowDateStr);

  useEnsureRouteTravelCacheForDate(
    currentDateStr,
    currentDayItems,
    employees,
    dispatchRouteOrders,
    currentTravelCache.isLoading
  );
  useEnsureRouteTravelCacheForDate(
    tomorrowDateStr,
    tomorrowItems,
    employees,
    tomorrowTravelCache.routeMap,
    tomorrowTravelCache.isLoading
  );

  const weekStartStr = useMemo(() => format(startOfWeek(addDays(currentDay, -28), { weekStartsOn: 0 }), "yyyy-MM-dd"), [currentDay]);
  const weekEndStr = useMemo(() => format(endOfWeek(addDays(currentDay, 28), { weekStartsOn: 0 }), "yyyy-MM-dd"), [currentDay]);
  const { routeMap: weekRouteOrders } = useRouteTravelCacheForWeek(weekStartStr, weekEndStr);

  // ── Attention Mode: fetch specific jobs matching the attention filter ──
  const GO_LIVE = '2026-03-24';
  const { data: attentionJobs, isLoading: attentionLoading } = useQuery({
    queryKey: ["attention_jobs", attentionFilter],
    enabled: !!attentionFilter,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      let query = supabase.from("jobs").select("id, job_number, customer_name, address, status, job_type, scheduled_date, assigned_to, description");

      switch (attentionFilter) {
        case "overdue":
          query = query.lt("scheduled_date", today).not("scheduled_date", "is", null)
            .not("status", "in", '("done","invoiced","canceled")');
          break;
        case "unassigned":
          query = query.is("assigned_to", null)
            .not("status", "in", '("done","invoiced","canceled")');
          break;
        case "deposits":
          query = query.eq("job_type", "install").is("deposit_paid_at", null)
            .not("assigned_to", "is", null).not("scheduled_date", "is", null)
            .neq("payment_method", "financed")
            .not("status", "in", '("done","invoiced","canceled")')
            .gte("created_at", GO_LIVE);
          break;
        case "finance":
          query = query.eq("job_type", "install").eq("payment_method", "financed")
            .is("finance_paperwork_at", null).not("assigned_to", "is", null)
            .not("status", "in", '("done","invoiced","canceled")')
            .gte("created_at", GO_LIVE);
          break;
        case "invoices":
          query = query.in("status", ["done", "in_progress"]).is("invoice_sent_at", null)
            .not("completion_form_sent_at", "is", null)
            .gte("created_at", GO_LIVE);
          break;
        case "warranty":
          query = query.eq("job_type", "install").in("status", ["done", "invoiced"])
            .is("warranty_registered_at", null)
            .gte("created_at", GO_LIVE);
          break;
        case "inspection":
          query = query.eq("job_type", "install").eq("permit_required", true)
            .in("status", ["done", "invoiced"]).is("inspection_passed_at", null)
            .gte("created_at", GO_LIVE);
          break;
        case "missing_site":
          query = query.eq("site_visit_missing", true).is("photos_uploaded_at", null)
            .not("status", "in", '("done","invoiced","canceled")');
          break;
        default:
          return [];
      }

      const { data, error } = await query.order("scheduled_date", { ascending: true }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const ATTENTION_LABELS: Record<string, string> = {
    overdue: "Overdue Jobs",
    unassigned: "Unassigned Jobs",
    deposits: "Deposits Needed",
    finance: "Finance Paperwork Missing",
    invoices: "Invoices Not Sent",
    warranty: "Warranty Not Registered",
    inspection: "Inspection Pending",
    missing_site: "Missing Site Visit Data",
    parts_ready: "Parts Ready for Pickup",
  };

  const clearAttention = () => {
    searchParams.delete("attention");
    setSearchParams(searchParams, { replace: true });
  };

  const empMap = useMemo(() => {
    const m: Record<string, string> = {};
    (employees || []).forEach((e: any) => { m[e.id] = e.name; });
    return m;
  }, [employees]);

  // ── Attention Mode Render ──
  if (attentionFilter) {
    const attentionTitle = ATTENTION_LABELS[attentionFilter] || attentionFilter;
    const jobsList = attentionJobs || [];

    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {!isMobile && <AppHeader />}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearAttention}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <h1 className="text-sm font-bold truncate">{attentionTitle}</h1>
            <Badge variant="destructive" className="text-xs shrink-0">
              {attentionLoading ? "…" : jobsList.length}
            </Badge>
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={clearAttention}>
            Back to Board
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {attentionLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : jobsList.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-sm font-medium">All clear!</p>
              <p className="text-xs mt-1">No jobs match this filter right now.</p>
            </div>
          ) : (
            jobsList.map((job: any) => (
              <button
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className={cn(
                  "w-full text-left rounded-lg border p-4 transition-all hover:shadow-sm hover:border-primary/30 active:scale-[0.99]",
                  "border-l-4",
                  job.job_type === "install" ? "border-l-primary" : job.job_type === "service" ? "border-l-[hsl(var(--today))]" : "border-l-[hsl(var(--complete))]"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{job.customer_name || "No Name"}</span>
                      {job.job_number && (
                        <span className="text-xs text-muted-foreground shrink-0">#{job.job_number}</span>
                      )}
                    </div>
                    {job.address && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{job.address}</p>
                    )}
                    {job.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{job.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    {job.scheduled_date && (
                      <p className="text-xs font-medium">{format(parseISO(job.scheduled_date), "MMM d")}</p>
                    )}
                    <Badge variant="outline" className="text-[10px]">{job.status}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-[10px]">{job.job_type}</Badge>
                  {job.assigned_to ? (
                    <span className="text-[10px] text-muted-foreground">
                      {empMap[job.assigned_to] || "Assigned"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-destructive font-medium">Unassigned</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  /* ── Mobile Layout ── */
  if (isMobile) {
    return (
      <div className="h-full bg-background flex flex-col overflow-hidden">
        {/* Mobile week picker — HCP-style with week cycling */}
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
              {format(startOfWeek(currentDay, { weekStartsOn: 0 }), "MMMM d")}–{format(endOfWeek(currentDay, { weekStartsOn: 0 }), "d, yyyy")}
            </span>
            {!isToday(currentDay) && (
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={goToToday}>Today</Button>
            )}
            {isToday(currentDay) && <div className="w-12" />}
          </div>
          {/* Day buttons */}
          <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto">
            {eachDayOfInterval({
              start: startOfWeek(currentDay, { weekStartsOn: 0 }),
              end: endOfWeek(currentDay, { weekStartsOn: 0 }),
            }).map((day) => (
              <button
                key={day.toISOString()}
                onClick={() => setCurrentDay(day)}
                className={cn(
                  "flex flex-col items-center px-2.5 py-1.5 rounded-lg text-xs transition-colors min-w-[44px] min-h-[44px] justify-center flex-1",
                  isSameDay(day, currentDay) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  isToday(day) && !isSameDay(day, currentDay) && "ring-1 ring-primary/50"
                )}
              >
                <span className="text-[10px] uppercase">{format(day, "EEE")}</span>
                <span className="text-sm font-bold">{format(day, "d")}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile filter chips */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-card overflow-x-auto shrink-0">
          {FILTERS.map(f => (
            <Badge
              key={f.value}
              variant={typeFilter === f.value ? "default" : "outline"}
              className="cursor-pointer text-xs whitespace-nowrap min-h-[32px] px-3"
              onClick={() => setTypeFilter(f.value)}
            >
              {f.label}
            </Badge>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="text-xs ml-auto shrink-0 gap-1"
            onClick={() => setViewMode(viewMode === "dispatch" ? "map" : "dispatch")}
          >
            {viewMode === "dispatch" ? <MapPin className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
            {viewMode === "dispatch" ? "Map" : "Board"}
          </Button>


        </div>

        {/* Selected day label */}
        <div className="flex items-center px-4 py-1 border-b bg-card/50 shrink-0">
          <span className="text-xs font-semibold text-foreground">
            {isToday(currentDay) ? "Today" : format(currentDay, "EEEE")}, {format(currentDay, "MMM d")}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : viewMode === "map" ? (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted-foreground">Loading map…</div>}>
            <JobsMapView
              items={filteredItems.filter(i => {
                if (!i.scheduled_date) return false;
                const d = parseISO(i.scheduled_date);
                if (mapRange === "today") return isSameDay(d, currentDay);
                return d >= startOfWeek(currentDay, { weekStartsOn: 1 }) && d <= endOfWeek(currentDay, { weekStartsOn: 1 });
              })}
              onItemClick={handleItemClick}
              mapRange={mapRange}
              onToggleRange={() => setMapRange(r => r === "today" ? "week" : "today")}
              employees={employees || []}
              supplyHouseLocations={supplyHouseLocations}
            />
          </Suspense>
        ) : (
          <MobileDispatchList
            dayItems={currentDayItems}
            employees={employees}
            routeOrders={dispatchRouteOrders}
          />
        )}

        {/* FAB for new job/estimate */}
        <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-2">
          <Button
            size="sm"
            className="h-10 rounded-full shadow-lg text-xs gap-1 bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] hover:bg-[hsl(var(--warning))]/90"
            onClick={() => setNewEstimateOpen(true)}
          >
            <Plus className="h-4 w-4" /> Est
          </Button>
          <Button
            size="lg"
            className="h-14 w-14 rounded-full shadow-lg"
            onClick={() => setNewJobOpen(true)}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>

        <NewJobDialog open={newJobOpen} onOpenChange={setNewJobOpen} defaultDate={newJobDate} />
        <NewEstimateDialog open={newEstimateOpen} onOpenChange={setNewEstimateOpen} />
      </div>
    );
  }

  /* ── Desktop Layout (unchanged) ── */
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {!isMobile && <AppHeader />}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={goToToday}>
              Today
            </Button>
             <Button variant="outline" size="sm" className="text-xs gap-1 relative" onClick={() => navigate("/jobs/backlog")}>
               <CalendarOff className="h-3.5 w-3.5" /> Backlog
              {queueCount > 0 && (
                <Badge variant="destructive" className="ml-0.5 h-4 min-w-[16px] text-[9px] px-1 rounded-full">
                  {queueCount > 99 ? "99+" : queueCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => setCurrentDay(subDays(currentDay, 7))}
              title="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => setCurrentDay(addDays(currentDay, 7))}
              title="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold whitespace-nowrap">
              {format(startOfWeek(currentDay, { weekStartsOn: 0 }), "MMMM d")}–{format(endOfWeek(currentDay, { weekStartsOn: 0 }), "d, yyyy")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* View dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  {viewMode === "week" && <CalendarRange className="h-3.5 w-3.5" />}
                  {viewMode === "day" && <CalendarDays className="h-3.5 w-3.5" />}
                  {viewMode === "dispatch" && <Rows3 className="h-3.5 w-3.5" />}
                  {viewMode === "map" && <MapPin className="h-3.5 w-3.5" />}
                  {viewMode === "week" ? "Week" : viewMode === "day" ? "Day" : viewMode === "dispatch" ? "Schedule" : "Map"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setViewMode("week")} className="text-xs gap-2">
                  <CalendarRange className="h-3.5 w-3.5" /> Week
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("day")} className="text-xs gap-2">
                  <CalendarDays className="h-3.5 w-3.5" /> Day
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("dispatch")} className="text-xs gap-2">
                  <Rows3 className="h-3.5 w-3.5" /> Schedule
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("map")} className="text-xs gap-2">
                  <MapPin className="h-3.5 w-3.5" /> Map
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Color by dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Palette className="h-3.5 w-3.5" />
                  Color: {colorBy === "employee" ? "Employee" : "Area"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuCheckboxItem checked={colorBy === "employee"} onCheckedChange={() => setColorBy("employee")} className="text-xs">
                  Employee
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={colorBy === "area"} onCheckedChange={() => setColorBy("area")} className="text-xs">
                  Area
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Calendar settings gear */}
            <CalendarSettings settings={calSettings} onChange={setCalSettings} />



            {viewMode === "week" && (
              <Button
                variant={bulkMode ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
              >
                <ListChecks className="h-3.5 w-3.5" />
                Bulk actions
              </Button>
            )}
          </div>
        </div>

        {/* Rain-day alert bar (visible when forecast shows business-hours rain) */}
        {!loading && (viewMode === "week" || viewMode === "day" || viewMode === "dispatch") && (() => {
          const visibleDates = viewMode === "day"
            ? [format(currentDay, "yyyy-MM-dd")]
            : eachDayOfInterval({
                start: startOfWeek(currentDay, { weekStartsOn: 0 }),
                end: endOfWeek(currentDay, { weekStartsOn: 0 }),
              }).map(d => format(d, "yyyy-MM-dd"));
          const counts = new Map<string, number>();
          const sourceItems = viewMode === "day" ? currentDayItems : weekItems;
          for (const it of sourceItems) {
            if (!it.scheduled_date) continue;
            const k = it.scheduled_date.substring(0, 10);
            counts.set(k, (counts.get(k) || 0) + 1);
          }
          return <RainDayAlertBar visibleDates={visibleDates} jobCountByDate={counts} />;
        })()}

        {/* Day Calendar */}
        {!loading && viewMode === "day" && (
          <DayCalendarBoard
            dayItems={currentDayItems}
            employees={employees}
            onItemClick={handleItemClick}
            currentDay={currentDay}
            routeOrders={dispatchRouteOrders}
            cardDensity={calSettings.cardDensity}
            visibleFields={calSettings.visibleFields}
            businessHoursOnly={calSettings.businessHoursOnly}
            showHolidays={calSettings.showHolidays}
          />
        )}

        {loading && (viewMode === "dispatch" || viewMode === "week" || viewMode === "day") && (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Bulk actions bar */}
        {bulkMode && viewMode === "week" && (
          <BulkActionsBar
            selectedItems={weekItems.filter(i => selectedIds.has(i.id)).map(i => ({
              id: i.id,
              item_type: i.item_type,
              customer_name: i.customer_name,
              job_number: i.job_number || i.hcp_job_number,
              estimate_number: (i as any).estimate_number,
            }))}
            totalItems={weekItems.length}
            employees={employees}
            onClose={() => { setBulkMode(false); setSelectedIds(new Set()); }}
            onClearSelection={() => setSelectedIds(new Set())}
          />
        )}

        {/* Week Calendar (HCP-style) */}
        {!loading && viewMode === "week" && (
          <WeekCalendarBoard
            weekItems={weekCarouselItems}
            employees={employees}
            onItemClick={handleItemClick}
            currentDay={currentDay}
            onDayClick={(day) => setCurrentDay(day)}
            bulkMode={bulkMode}
            selectedIds={selectedIds}
            onToggleSelect={(id) => {
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            routeOrders={weekRouteOrders}
            cardDensity={calSettings.cardDensity}
            visibleFields={calSettings.visibleFields}
            businessHoursOnly={calSettings.businessHoursOnly}
            showHolidays={calSettings.showHolidays}
          />
        )}

        {/* Day Dispatch Board */}
        {!loading && viewMode === "dispatch" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Day picker strip */}
            <div className="flex items-center gap-1 px-4 py-2 border-b bg-card overflow-x-auto shrink-0">
              {eachDayOfInterval({
                start: startOfWeek(currentDay, { weekStartsOn: 0 }),
                end: endOfWeek(currentDay, { weekStartsOn: 0 }),
              }).map((day) => (
                <button
                  key={day.toISOString()}
                  onClick={() => setCurrentDay(day)}
                  className={cn(
                    "flex flex-col items-center px-3 py-1.5 rounded-lg text-xs transition-colors min-w-[48px]",
                    isSameDay(day, currentDay) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                    isToday(day) && !isSameDay(day, currentDay) && "ring-1 ring-primary/50"
                  )}
                >
                  <span className="text-[10px] uppercase">{format(day, "EEE")}</span>
                  <span className="text-sm font-bold">{format(day, "d")}</span>
                  {calSettings.showHolidays && getUsHolidayName(day) && (
                    <span className="text-[9px] leading-none max-w-16 truncate">{getUsHolidayName(day)}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Board header */}
            <div className="flex items-center px-4 py-1 border-b shrink-0 bg-card gap-1">
              <div className="flex items-center gap-1.5 text-xs h-8 px-3 rounded-md font-medium bg-primary text-primary-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Board
              </div>
            </div>

            {/* Dispatch Board */}
            <DispatchBoard
              dayItems={currentDayItems}
              employees={employees}
              onItemClick={handleItemClick}
              routeOrders={dispatchRouteOrders}
              visibleFields={calSettings.visibleFields}
              cardDensity={calSettings.cardDensity}
              businessHoursOnly={calSettings.businessHoursOnly}
              showHolidays={calSettings.showHolidays}
            />
          </div>
        )}
        {/* Map View */}
        {!loading && viewMode === "map" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-muted-foreground">Loading map…</div>}>
            <JobsMapView
              items={filteredItems.filter(i => {
                if (!i.scheduled_date) return false;
                const d = parseISO(i.scheduled_date);
                if (mapRange === "today") return isSameDay(d, currentDay);
                return d >= startOfWeek(currentDay, { weekStartsOn: 1 }) && d <= endOfWeek(currentDay, { weekStartsOn: 1 });
              })}
              onItemClick={handleItemClick}
              mapRange={mapRange}
              onToggleRange={() => setMapRange(r => r === "today" ? "week" : "today")}
              employees={employees || []}
              supplyHouseLocations={supplyHouseLocations}
            />
          </Suspense>
        )}
      </main>
      <NewJobDialog open={newJobOpen} onOpenChange={setNewJobOpen} defaultDate={newJobDate} />
      <NewEstimateDialog open={newEstimateOpen} onOpenChange={setNewEstimateOpen} />
    </div>
  );
};

export default Jobs;
