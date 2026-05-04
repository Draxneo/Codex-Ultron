import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSameYear,
  parseISO,
  startOfWeek,
  subDays,
} from "date-fns";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Filter, Inbox, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { WeekCalendarBoard } from "@/components/job/WeekCalendarBoard";
import { CalendarSettings, useCalendarSettings } from "@/components/job/CalendarSettings";
import { DispatchOpsChipStrip } from "@/components/dispatch/DispatchOpsChipStrip";
import { DispatchStackDrawer } from "@/components/dispatch/DispatchStackDrawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDispatchCardAlerts } from "@/hooks/useDispatchCardAlerts";
import { useDispatchCardAlertActions } from "@/components/dispatch/useDispatchCardAlertActions";
import { useEmployees } from "@/hooks/useEmployees";
import { useEstimates } from "@/hooks/useEstimates";
import { useCalendarJobs } from "@/hooks/useJobs";
import { errorMessage } from "@/lib/errorMessage";

type CalendarItem = {
  id: string;
  item_type: "job" | "estimate";
  customer_name: string | null;
  customer_id: string | null;
  address: string | null;
  description: string | null;
  assigned_to: string | null;
  scheduled_date: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  job_type: string;
  status?: string | null;
  work_status?: string | null;
  job_number?: string | null;
  hcp_job_number?: string | null;
  hcp_customer_id: string | null;
  customer_phone: string | null;
  estimate_number?: string | null;
  [key: string]: any;
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "estimate", label: "Estimates" },
  { value: "install", label: "Installs" },
  { value: "service", label: "Service" },
  { value: "maintenance", label: "Maint." },
];

const STATUS_HIDDEN_FROM_CALENDAR = new Set(["canceled", "cancelled"]);

function parseDateParam(value: string | null) {
  if (!value) return new Date();
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatWeekRange(day: Date) {
  const start = startOfWeek(day, { weekStartsOn: 0 });
  const end = endOfWeek(day, { weekStartsOn: 0 });
  if (isSameMonth(start, end)) return `${format(start, "MMMM d")}-${format(end, "d, yyyy")}`;
  if (isSameYear(start, end)) return `${format(start, "MMM d")}-${format(end, "MMM d, yyyy")}`;
  return `${format(start, "MMM d, yyyy")}-${format(end, "MMM d, yyyy")}`;
}

export default function DispatchCalendar() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: jobs, isLoading: jobsLoading, isError: jobsError, error: jobsQueryError } = useCalendarJobs();
  const { data: estimates, isLoading: estimatesLoading, isError: estimatesError, error: estimatesQueryError } = useEstimates(true);
  const { data: employees = [] } = useEmployees();
  const { settings: calendarSettings, update: setCalendarSettings } = useCalendarSettings();
  const [currentDay, setCurrentDayState] = useState(() => parseDateParam(searchParams.get("date")));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  // 2026-05-04: Stack drawer state — slim left rail showing unscheduled work
  // (Past Due, Ready to Schedule, Customer Decisions, New Leads). Replaces
  // what used to live on /now. Closed by default; toggled via the Stack
  // button in the calendar header.
  const [stackOpen, setStackOpen] = useState(false);
  // Per-card alert lookup — drives the badge/popover overlay on each calendar
  // card showing pending action_items, blocked workflow alerts, and derived
  // job-state alerts (deposit needed, missing photos, etc.). Replaces the
  // entire Now HQ card surface.
  const { alertsByJobId } = useDispatchCardAlerts();
  const { resolveAlert, retryAlert, navigateAlert } = useDispatchCardAlertActions();

  const setCurrentDay = (day: Date) => {
    setCurrentDayState(day);
    const next = new URLSearchParams(searchParams);
    next.set("date", format(day, "yyyy-MM-dd"));
    setSearchParams(next, { replace: true });
  };

  const scheduleItems = useMemo<CalendarItem[]>(() => {
    const realJobHcpIds = new Set(
      (jobs || [])
        .filter((job: any) => job.hcp_id && job.job_type !== "estimate")
        .map((job: any) => job.hcp_id)
    );

    const jobItems = (jobs || []).map((job: any) => ({
      ...job,
      item_type: "job" as const,
      job_type: job.job_type || "service",
      job_number: job.job_number || job.hcp_job_number,
      hcp_customer_id: job.hcp_customer_id || null,
      arrival_start: job.arrival_start || null,
      arrival_end: job.arrival_end || null,
    }));

    const estimateItems = (estimates || [])
      .filter((estimate: any) => !estimate.hcp_id || !realJobHcpIds.has(estimate.hcp_id))
      .map((estimate: any) => ({
        ...estimate,
        item_type: "estimate" as const,
        job_type: "estimate",
        hcp_job_number: null,
        job_number: null,
        hcp_customer_id: estimate.hcp_customer_id || null,
        arrival_start: estimate.arrival_start || null,
        arrival_end: estimate.arrival_end || null,
      }));

    return [...jobItems, ...estimateItems];
  }, [jobs, estimates]);

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return scheduleItems.filter((item) => {
      const status = (item.status || item.work_status || "").toLowerCase();
      if (STATUS_HIDDEN_FROM_CALENDAR.has(status)) return false;
      if (filter === "estimate" && item.item_type !== "estimate") return false;
      if (filter !== "all" && filter !== "estimate" && (item.item_type === "estimate" || item.job_type !== filter)) return false;
      if (!search) return true;
      return [item.customer_name, item.address, item.description, item.job_number, item.hcp_job_number, item.estimate_number]
        .some((value) => String(value || "").toLowerCase().includes(search));
    });
  }, [scheduleItems, query, filter]);

  const calendarItems = useMemo(() => {
    const rangeStart = startOfWeek(addDays(currentDay, -28), { weekStartsOn: 0 });
    const rangeEnd = endOfWeek(addDays(currentDay, 28), { weekStartsOn: 0 });
    return filteredItems.filter((item) => {
      if (!item.scheduled_date) return false;
      const day = parseISO(item.scheduled_date);
      return day >= rangeStart && day <= rangeEnd;
    });
  }, [filteredItems, currentDay]);

  const currentDayCount = filteredItems.filter((item) => item.scheduled_date && isSameDay(parseISO(item.scheduled_date), currentDay)).length;
  const activeFilterLabel = FILTERS.find((option) => option.value === filter)?.label || "All";
  const loading = jobsLoading || estimatesLoading;
  const calendarDataIssues = [
    jobsError ? `jobs (${errorMessage(jobsQueryError)})` : null,
    estimatesError ? `estimates (${errorMessage(estimatesQueryError)})` : null,
  ].filter(Boolean);

  const openItem = (item: CalendarItem) => {
    navigate(item.item_type === "estimate" ? `/estimates/${item.id}` : `/jobs/${item.id}`);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* 2026-05-04: Stack drawer mounts here at the root so the Sheet
          slides in over the whole calendar. State controlled by stackOpen. */}
      <DispatchStackDrawer open={stackOpen} onOpenChange={setStackOpen} />
      <AppHeader
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search calendar"
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-card px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {/* 2026-05-04: Stack drawer toggle — slim left-rail showing
                  unscheduled work (Past Due, Ready to Schedule, Customer
                  Decisions, New Leads). Replaces what used to live on /now. */}
              <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5" onClick={() => setStackOpen(true)}>
                <Inbox className="h-4 w-4" />
                Stack
              </Button>
              {/* Calendar is now the default Dispatch view. Was a back-button
                  to /dispatch — that would loop now. Swapped to a forward-link
                  into /dispatch/board for the per-tech board view. */}
              <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5" onClick={() => navigate("/dispatch/board")}>
                <Users className="h-4 w-4" />
                Board view
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-foreground">Dispatch HQ</h1>
                  <Badge variant="secondary">Weekly</Badge>
                </div>
                <p className="hidden text-xs text-muted-foreground md:block">
                  Weekly schedule showing open spots, overlaps, and arrival windows.
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
                    <Filter className="h-3.5 w-3.5" />
                    {activeFilterLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {FILTERS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      className="gap-2"
                      onClick={() => setFilter(option.value)}
                    >
                      <Check className={filter === option.value ? "h-4 w-4 opacity-100" : "h-4 w-4 opacity-0"} />
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <CalendarSettings settings={calendarSettings} onChange={setCalendarSettings} />
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentDay(subDays(currentDay, 7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[190px] rounded-md border bg-background px-2.5 py-1 text-center">
                <div className="text-sm font-semibold leading-5 text-foreground">{formatWeekRange(currentDay)}</div>
                <div className="text-[10px] leading-4 text-muted-foreground">{currentDayCount} job{currentDayCount === 1 ? "" : "s"} selected day</div>
              </div>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentDay(addDays(currentDay, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => setCurrentDay(new Date())}>
                Today
              </Button>
              {/* 2026-05-04 (v2): Ops alert chips moved INTO the header toolbar
                  next to the date nav. Was on its own row below the header,
                  which pushed the day-headers (with weather!) down and clipped
                  the weather emoji + temps. Now lives inline so dispatchers
                  always see the weather. */}
              <DispatchOpsChipStrip className="ml-1" />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {calendarDataIssues.length > 0 && (
            <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Calendar is open, but part of the schedule did not load: {calendarDataIssues.join(", ")}. Refresh before relying on this view.
                </p>
              </div>
            </div>
          )}
          {loading ? (
            <div className="grid flex-1 gap-3 p-4">
              <Skeleton className="h-full min-h-96 rounded-lg" />
            </div>
          ) : (
            <>
              {/* 2026-05-04: Removed the "Weekly calendar / Scroll vertically..."
                  subheader. It was an obvious hint nobody needs and was eating
                  vertical space that pushed the day-headers (with weather!)
                  partially off-screen. */}
              <WeekCalendarBoard
                weekItems={calendarItems}
                employees={employees}
                onItemClick={openItem}
                currentDay={currentDay}
                onDayClick={setCurrentDay}
                cardDensity={calendarSettings.cardDensity}
                visibleFields={calendarSettings.visibleFields}
                businessHoursOnly={calendarSettings.businessHoursOnly}
                showHolidays={calendarSettings.showHolidays}
                hourHeight={44}
                /* 2026-05-04: Bumped from 92 -> 124 so the day-header tile
                   has enough room to show all four lines without clipping
                   the weather badge: day name, date number, item count,
                   and weather emoji + temps + precip. 92 was clipping the
                   bottom of the weather row. */
                headerHeight={124}
                /* 2026-05-04: Per-card alerts now ride with each calendar card.
                   The badge component renders inside the card grid item AND
                   inside the hover popover so dispatchers can see + act on
                   pending todos without leaving the calendar. */
                alertsByJobId={alertsByJobId}
                onAlertResolve={resolveAlert}
                onAlertRetry={retryAlert}
                onAlertNavigate={navigateAlert}
              />
            </>
          )}
        </div>
      </main>

    </div>
  );
}
