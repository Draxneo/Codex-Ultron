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
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { WeekCalendarBoard } from "@/components/job/WeekCalendarBoard";
import { CalendarSettings, useCalendarSettings } from "@/components/job/CalendarSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmployees } from "@/hooks/useEmployees";
import { useEstimates } from "@/hooks/useEstimates";
import { useCalendarJobs } from "@/hooks/useJobs";

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
  const { data: jobs, isLoading: jobsLoading } = useCalendarJobs();
  const { data: estimates, isLoading: estimatesLoading } = useEstimates(true);
  const { data: employees = [] } = useEmployees();
  const { settings: calendarSettings, update: setCalendarSettings } = useCalendarSettings();
  const [currentDay, setCurrentDayState] = useState(() => parseDateParam(searchParams.get("date")));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

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

  const openItem = (item: CalendarItem) => {
    navigate(item.item_type === "estimate" ? `/estimates/${item.id}` : `/jobs/${item.id}`);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search calendar"
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-card px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5" onClick={() => navigate("/dispatch")}>
                <ArrowLeft className="h-4 w-4" />
                Dispatch HQ
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight text-foreground">Dispatch Calendar</h1>
                  <Badge variant="secondary">Full Screen</Badge>
                </div>
                <p className="hidden text-xs text-muted-foreground md:block">
                  Housecall-style weekly schedule for openings, overlaps, and arrival windows.
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
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="grid flex-1 gap-3 p-4">
              <Skeleton className="h-full min-h-96 rounded-lg" />
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-3 py-1">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Calendar workspace</span>
                <span className="text-[11px] text-muted-foreground">
                  Scroll vertically for the day, horizontally for surrounding days.
                </span>
              </div>
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
                headerHeight={92}
              />
            </>
          )}
        </div>
      </main>

    </div>
  );
}
