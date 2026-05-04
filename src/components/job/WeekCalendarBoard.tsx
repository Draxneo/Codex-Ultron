import { useMemo, useRef, useEffect, useState } from "react";
import { format, isSameDay, isToday, parseISO, startOfWeek, addDays } from "date-fns";
import { AlertTriangle as AlertTriangleIcon, Clock, Phone, MapPin, Wrench, ClipboardList, Calendar, Car, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { Button } from "@/components/ui/button";
import type { CalendarVisibleFields, CardDensity } from "@/components/job/CalendarSettings";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import { useHistoricalWeather } from "@/hooks/useHistoricalWeather";
import { WeatherBadge } from "@/components/weather/WeatherBadge";
import { getUsHolidayName } from "@/lib/usHolidays";
import { AskJarvisButton } from "@/components/jarvis/AskJarvisButton";
import { DispatchCardAlertBadge } from "@/components/dispatch/DispatchCardAlertBadge";
import type { DispatchAlert } from "@/hooks/useDispatchCardAlerts";
import { formatPhone } from "@/lib/formatters";

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
  [key: string]: any;
}

const JOB_TYPE_EMOJI: Record<string, string> = {
  service: "🔧",
  install: "🏗️",
  maintenance: "🔄",
  estimate: "📋",
  phone_call: "📞",
};

const JOB_TYPE_TAG: Record<string, string> = {
  service: "SERV",
  install: "INST",
  maintenance: "MAINT",
  estimate: "EST",
  phone_call: "CALL",
};

// HCP-style dark professional palette for tech coloring
const TECH_HEX_PALETTE = [
  "#0d7377", "#1e3a5f", "#8b7d3c", "#1b1b6b", "#c0392b",
  "#2e86c1", "#7d3c98", "#27ae60", "#e67e22", "#2c3e50",
];

const UNASSIGNED_COLOR = "#6b7280";

const TIME_GUTTER_WIDTH = 60;
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 21;
const BUSINESS_START_HOUR = 7;
const BUSINESS_END_HOUR = 19;
const DEFAULT_HOUR_HEIGHT = 64;
const DEFAULT_HEADER_HEIGHT = 116;

function getStartEnd(item: BoardItem) {
  if (!item.arrival_start) return null;
  try {
    const start = new Date(item.arrival_start);
    const startH = start.getHours() + start.getMinutes() / 60;
    let endH = startH + 1;
    if (item.arrival_end) {
      const end = new Date(item.arrival_end);
      endH = end.getHours() + end.getMinutes() / 60;
    }
    if (endH <= startH) endH = startH + 1;
    return { startH, endH };
  } catch {
    return null;
  }
}

function formatTime(dateStr: string) {
  try {
    return format(new Date(dateStr), "h:mma").toLowerCase();
  } catch {
    return "";
  }
}

interface WeekCalendarBoardProps {
  weekItems: BoardItem[];
  employees: any[] | undefined;
  onItemClick: (item: BoardItem) => void;
  currentDay: Date;
  onDayClick: (day: Date) => void;
  bulkMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  routeOrders?: Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>;
  cardDensity?: CardDensity;
  visibleFields?: CalendarVisibleFields;
  businessHoursOnly?: boolean;
  showHolidays?: boolean;
  hourHeight?: number;
  headerHeight?: number;
  // 2026-05-04: Per-card alerts. Optional so other consumers of WeekCalendarBoard
  // (Tech mobile, etc.) don't have to wire alerts unless they want them.
  alertsByJobId?: Map<string, DispatchAlert[]>;
  onAlertResolve?: (alert: DispatchAlert) => void;
  onAlertRetry?: (alert: DispatchAlert) => void;
  onAlertNavigate?: (alert: DispatchAlert) => void;
  /** Generic dispatcher for any DispatchAlertActionKind — used by the in-
   *  popover action buttons including secondary actions like "Customer
   *  financed". Callers typically wire this to runAction from
   *  useDispatchCardAlertActions(). */
  onAlertAction?: (alert: DispatchAlert, kind?: import("@/hooks/useDispatchCardAlerts").DispatchAlertActionKind, target?: string) => void;
}

export function WeekCalendarBoard({ weekItems, employees, onItemClick, currentDay, onDayClick, bulkMode, selectedIds, onToggleSelect, routeOrders, cardDensity = "comfortable", visibleFields, businessHoursOnly = false, showHolidays = false, hourHeight = DEFAULT_HOUR_HEIGHT, headerHeight = DEFAULT_HEADER_HEIGHT, alertsByJobId, onAlertResolve, onAlertRetry, onAlertNavigate, onAlertAction }: WeekCalendarBoardProps) {
  const VISIBLE_WEEKS = 9;
  const CENTER_WEEK_INDEX = Math.floor(VISIBLE_WEEKS / 2);
  const weekStart = startOfWeek(currentDay, { weekStartsOn: 0 });
  const rangeStart = addDays(weekStart, -CENTER_WEEK_INDEX * 7);
  const days = Array.from({ length: VISIBLE_WEEKS * 7 }, (_, i) => addDays(rangeStart, i));
  const startHour = businessHoursOnly ? BUSINESS_START_HOUR : DEFAULT_START_HOUR;
  const endHour = businessHoursOnly ? BUSINESS_END_HOUR : DEFAULT_END_HOUR;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const { data: forecastMap } = useWeatherForecast();
  const dayKeys = useMemo(() => days.map((d) => format(d, "yyyy-MM-dd")), [days]);
  const { data: historicalMap } = useHistoricalWeather(dayKeys);

  const empColorMap = useMemo(() => {
    const m = new Map<string, string>();
    (employees || []).forEach((emp: any, i: number) => {
      m.set(emp.name, TECH_HEX_PALETTE[i % TECH_HEX_PALETTE.length]);
    });
    return m;
  }, [employees]);

  const dayItemsMap = useMemo(() => {
    const map = new Map<string, BoardItem[]>();
    for (const day of days) {
      map.set(format(day, "yyyy-MM-dd"), []);
    }
    for (const item of weekItems) {
      if (!item.scheduled_date) continue;
      const key = item.scheduled_date.substring(0, 10);
      const existing = map.get(key);
      if (existing) existing.push(item);
    }
    return map;
  }, [weekItems, days]);

  function layoutDay(items: BoardItem[]) {
    const timed: { item: BoardItem; startH: number; endH: number }[] = [];
    const untimed: BoardItem[] = [];
    for (const item of items) {
      const se = getStartEnd(item);
      if (se) timed.push({ item, ...se });
      else untimed.push(item);
    }
    timed.sort((a, b) => a.startH - b.startH);
    const columns: { endH: number }[] = [];
    const laid: { item: BoardItem; startH: number; endH: number; col: number; totalCols: number }[] = [];
    for (const t of timed) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        if (t.startH >= columns[c].endH) {
          columns[c].endH = t.endH;
          laid.push({ ...t, col: c, totalCols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        laid.push({ ...t, col: columns.length, totalCols: 0 });
        columns.push({ endH: t.endH });
      }
    }
    const totalCols = columns.length || 1;
    for (const l of laid) l.totalCols = totalCols;
    return { laid, untimed, maxOverlap: totalCols };
  }

  // 2026-05-04: Make the calendar fill the screen so 7 days show without
  // needing a horizontal scroll. We measure the live container width and set
  // each day column to (containerWidth - timeGutter) / 7. Days with multiple
  // overlapping cards still expand beyond that floor — the resulting overflow
  // is preserved as horizontal scroll for those busy days only. Empty/normal
  // days fill the viewport evenly. (Before this change, columnWidth was a
  // fixed 120-180px which crammed 11+ days into the viewport.)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeDayRef = useRef<HTMLDivElement>(null);
  const [edgePadding, setEdgePadding] = useState({ left: 0, right: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Compute base width once we know the container size. Floor of 180 so we
  // never go below readable; 7 days fit when container is at least 1320px.
  const baseColumnWidth = containerWidth > 0
    ? Math.max(180, Math.floor((containerWidth - TIME_GUTTER_WIDTH) / 7))
    : 180;

  // 2026-05-04: Stretch hour rows to fill the container vertically too.
  // Before this, hourHeight was a fixed 44px and the calendar only used
  // the first ~620px of viewport, leaving big empty space below 6 PM
  // (Clint's report). Now we floor at the prop-passed hourHeight (so we
  // never shrink below readable) and grow to fill whatever vertical
  // space remains after the day-header takes its share.
  const hoursVisible = endHour - startHour;
  const effectiveHourHeight = containerHeight > 0
    ? Math.max(hourHeight, Math.floor((containerHeight - headerHeight) / hoursVisible))
    : hourHeight;
  const totalHeight = hoursVisible * effectiveHourHeight;

  const dayColumns = useMemo(() => {
    return days.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      const dayItems = dayItemsMap.get(key) || [];
      const { laid, untimed, maxOverlap } = layoutDay(dayItems);
      const CARD_MIN_WIDTH = 180;
      // Empty days take the base. Days with cards take whichever is larger
      // between (a) the base "fit 7 in viewport" width or (b) the overlap-driven
      // width that prevents cards from overlapping visually.
      const columnWidth = dayItems.length === 0
        ? baseColumnWidth
        : Math.max(baseColumnWidth, maxOverlap * CARD_MIN_WIDTH);
      return { day, key, dayItems, laid, untimed, columnWidth };
    });
  }, [days, dayItemsMap, baseColumnWidth]);

  useEffect(() => {
    const measure = () => {
      const container = scrollContainerRef.current;
      if (!container || dayColumns.length === 0) return;

      // Track container width AND height so the next render can compute
      // baseColumnWidth and effectiveHourHeight to fill the viewport in
      // both axes. Using ResizeObserver-equivalent via window resize + RAF.
      setContainerWidth((prev) => (prev === container.clientWidth ? prev : container.clientWidth));
      setContainerHeight((prev) => (prev === container.clientHeight ? prev : container.clientHeight));

      const firstWidth = dayColumns[0]?.columnWidth ?? 120;
      const lastWidth = dayColumns[dayColumns.length - 1]?.columnWidth ?? 120;
      const next = {
        left: Math.max(0, Math.round(container.clientWidth / 2 - TIME_GUTTER_WIDTH - firstWidth / 2)),
        right: Math.max(0, Math.round(container.clientWidth / 2 - lastWidth / 2)),
      };

      setEdgePadding((prev) =>
        prev.left === next.left && prev.right === next.right ? prev : next,
      );
    };

    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [dayColumns]);

  useEffect(() => {
    let r2 = 0;
    const center = () => {
      const container = scrollContainerRef.current;
      const dayEl = activeDayRef.current;
      if (!container || !dayEl) return;
      const scrollLeft = dayEl.offsetLeft - container.clientWidth / 2 + dayEl.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: "auto" });
    };
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(center);
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [currentDay, weekItems, edgePadding.left, edgePadding.right]);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-auto min-h-0 fat-scrollbar">
      <div className="flex w-max">
        {/* Time gutter — sticky so it floats over scrolling days */}
        <div className="w-[60px] shrink-0 sticky left-0 z-30 bg-card">
          <div style={{ height: headerHeight }} className="border-b border-r bg-card" />
          <div className="relative border-r bg-card" style={{ height: totalHeight }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute w-full border-b border-border/30 flex items-start justify-end pr-2 pt-0.5"
                style={{ top: (hour - startHour) * effectiveHourHeight, height: effectiveHourHeight }}
              >
                <span className="text-[10px] text-muted-foreground font-medium">
                  {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                </span>
              </div>
            ))}
          </div>
        </div>

          <div className="shrink-0" style={{ width: edgePadding.left }} />

          {/* Day columns */}
          {dayColumns.map(({ day, key, dayItems, laid, untimed, columnWidth }) => {
            const isCurrentDay = isSameDay(day, currentDay);
            const isTodayDay = isToday(day);
            const fc = forecastMap?.get(key) || historicalMap?.get(key);
            const weatherTint = !isCurrentDay && fc
              ? fc.heat_warning
                ? "bg-gradient-to-b from-orange-100 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/20"
                : fc.business_hours_rain
                  ? "bg-gradient-to-b from-blue-100 to-sky-50 dark:from-blue-950/40 dark:to-sky-950/20"
                  : fc.condition === "storm"
                    ? "bg-gradient-to-b from-slate-200 to-slate-100 dark:from-slate-800/60 dark:to-slate-900/40"
                    : fc.condition === "snow"
                      ? "bg-gradient-to-b from-sky-50 to-white dark:from-sky-950/30 dark:to-slate-950/20"
                      : fc.condition === "clouds"
                        ? "bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-800/40 dark:to-slate-900/20"
                        : "bg-gradient-to-b from-amber-50 to-yellow-50/60 dark:from-amber-950/30 dark:to-yellow-950/10"
              : "";

            return (
              <div key={key} ref={isCurrentDay ? activeDayRef : undefined} className="shrink-0" style={{ width: columnWidth }}>
                <div className="px-1 pt-1 pb-0.5 border-b border-r bg-background" style={{ height: headerHeight }}>
                  <button
                    onClick={() => onDayClick(day)}
                    className={cn(
                      "w-full h-full flex flex-col items-center justify-center transition-colors gap-1 px-2 py-2 rounded-lg shadow-sm border",
                      isTodayDay
                        ? "bg-primary text-primary-foreground border-primary"
                        : cn("hover:brightness-105 border-border/50", weatherTint || "bg-card hover:bg-muted/60"),
                      isCurrentDay && !isTodayDay && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                  >
                    <span className={cn("text-[10px] uppercase tracking-wider font-semibold", isTodayDay ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {format(day, "EEE")}
                    </span>
                    <span className={cn("text-lg font-bold leading-none", isTodayDay ? "text-primary-foreground" : "text-foreground")}>
                      {format(day, "d")}
                    </span>
                    {showHolidays && getUsHolidayName(day) && (
                      <span className={cn("text-[9px] font-semibold leading-none truncate max-w-full", isTodayDay ? "text-primary-foreground/80" : "text-amber-700 dark:text-amber-300")}>
                        {getUsHolidayName(day)}
                      </span>
                    )}
                    {dayItems.length > 0 && (
                      <span className={cn("text-[10px] font-medium leading-none", isTodayDay ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {dayItems.length} item{dayItems.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    <div className="mt-0.5 w-full overflow-hidden flex justify-center">
                      <WeatherBadge forecast={fc} inverted={isTodayDay} />
                    </div>
                  </button>
                </div>

                <div
                  className={cn("relative border-r", isCurrentDay && "bg-primary/[0.03]", isTodayDay && !isCurrentDay && "bg-accent/20")}
                  style={{ height: totalHeight }}
                >
                  {hours.map((hour) => (
                    <div key={hour} className="absolute w-full border-b border-border/20" style={{ top: (hour - startHour) * effectiveHourHeight, height: effectiveHourHeight }} />
                  ))}

                  {/* Untimed items */}
                  {untimed.length > 0 && (
                    <div className="absolute top-0 left-0 right-0 z-20 p-0.5 flex flex-col gap-0.5">
                      {untimed.map(item => (
                        <WeekCard key={item.id} item={item} onClick={onItemClick} techColor={empColorMap.get(item.assigned_to || "") || UNASSIGNED_COLOR} compact={false} bulkMode={bulkMode} selected={selectedIds?.has(item.id)} onToggleSelect={onToggleSelect} routeInfo={routeOrders?.get(item.id)} cardDensity={cardDensity} visibleFields={visibleFields} alerts={alertsByJobId?.get(item.id) || []} onAlertResolve={onAlertResolve} onAlertRetry={onAlertRetry} onAlertNavigate={onAlertNavigate} onAlertAction={onAlertAction} />
                      ))}
                    </div>
                  )}

                  {/* Timed cards */}
                  {laid.map(({ item, startH, endH, col, totalCols }) => {
                    const top = (startH - startHour) * effectiveHourHeight;
                    const height = Math.max((endH - startH) * effectiveHourHeight, 34);
                    const colWidth = 100 / totalCols;
                    const left = col * colWidth;
                    return (
                      <div
                        key={item.id}
                        className="absolute z-10 px-0.5"
                        style={{ top: `${top}px`, height: `${height}px`, left: `${left}%`, width: `${colWidth}%` }}
                      >
                        <WeekCard
                          item={item}
                          onClick={onItemClick}
                          techColor={empColorMap.get(item.assigned_to || "") || UNASSIGNED_COLOR}
                          showTime
                          height={height}
                          compact={false}
                          bulkMode={bulkMode}
                          selected={selectedIds?.has(item.id)}
                          onToggleSelect={onToggleSelect}
                          routeInfo={routeOrders?.get(item.id)}
                          cardDensity={cardDensity}
                          visibleFields={visibleFields}
                          alerts={alertsByJobId?.get(item.id) || []}
                          onAlertResolve={onAlertResolve}
                          onAlertRetry={onAlertRetry}
                          onAlertNavigate={onAlertNavigate}
                          onAlertAction={onAlertAction}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        <div className="shrink-0" style={{ width: edgePadding.right }} />
      </div>
    </div>
  );
}

// ── Individual Card with HoverCard popover ──
function WeekCard({
  item,
  onClick,
  techColor,
  compact,
  showTime,
  height,
  bulkMode,
  selected,
  onToggleSelect,
  routeInfo,
  cardDensity = "comfortable",
  visibleFields,
  alerts = [],
  onAlertResolve,
  onAlertRetry,
  onAlertNavigate,
  onAlertAction,
}: {
  item: BoardItem;
  onClick: (item: BoardItem) => void;
  techColor: string;
  compact?: boolean;
  showTime?: boolean;
  height?: number;
  bulkMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  routeInfo?: { order: number; travelMin: number | null; fromLabel: string | null };
  cardDensity?: CardDensity;
  visibleFields?: CalendarVisibleFields;
  // 2026-05-04: Per-card alerts. Optional — defaults to empty array so Tech-mobile
  // and any other consumers that don't wire alerts still render correctly.
  alerts?: DispatchAlert[];
  onAlertResolve?: (alert: DispatchAlert) => void;
  onAlertRetry?: (alert: DispatchAlert) => void;
  onAlertNavigate?: (alert: DispatchAlert) => void;
  onAlertAction?: (alert: DispatchAlert, kind?: import("@/hooks/useDispatchCardAlerts").DispatchAlertActionKind, target?: string) => void;
}) {
  const emoji = JOB_TYPE_EMOJI[item.job_type] || "🔧";
  const tag = JOB_TYPE_TAG[item.job_type] || "SERV";
  // 2026-05-04: Lowered isTiny from 50→40 so 1-hour arrival windows (44px
  // tall on the calendar with hourHeight=44) still show the time + job
  // number. Without this, jobs with short arrival windows like Clay Hays
  // (5–6pm) only showed the customer name and looked broken next to longer
  // jobs that had full detail. isSmall stays at 80 so address+phone still
  // hide on small cards (those need more visual space).
  const isSmall = (height || 0) < 80;
  const isTiny = (height || 0) < 40;
  const isCompact = cardDensity === "compact";
  const isExpanded = cardDensity === "expanded";

  const timeStr = item.arrival_start
    ? `${formatTime(item.arrival_start)}${item.arrival_end ? `–${formatTime(item.arrival_end)}` : ""}`
    : null;

  const number = item.item_type === "estimate"
    ? (item.estimate_number ? `Est #${item.estimate_number}` : null)
    : ((item.job_number || item.hcp_job_number) ? `Job #${item.job_number || item.hcp_job_number}` : null);
  const amount = item.amount ?? item.total_amount ?? item.total ?? null;
  const addressParts = (item.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  const street = addressParts[0] || item.address;
  const zip = item.address?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || null;

  const initials = item.assigned_to
    ? item.assigned_to.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()
    : null;

  const travelColor = routeInfo?.travelMin != null
    ? routeInfo.travelMin <= 15 ? "bg-emerald-500/80" : routeInfo.travelMin <= 30 ? "bg-amber-500/80" : "bg-red-500/80"
    : null;

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onToggleSelect?.(item.id);
  };

  const cardContent = (
    <div
      onClick={() => bulkMode ? onToggleSelect?.(item.id) : onClick(item)}
      className={cn(
        "relative h-full rounded-md cursor-pointer overflow-hidden flex flex-col transition-shadow hover:shadow-lg hover:brightness-110 border border-white/40 ring-1 ring-black/10 shadow-md",
        selected && "ring-2 ring-white ring-offset-1 ring-offset-background"
      )}
      style={{ backgroundColor: techColor }}
    >
      {/* 2026-05-04: Per-card alert badge. Originally at top-0.5 right-0.5
          but that sat on top of the tech avatar/initials circle and (when
          we wire avatar photos) the tech picture. Moved to bottom-right
          so the badge stays clearly visible without ever covering the
          tech identity. Hover/click opens a popover with action buttons
          (Resolve, Retry, View). Replaces Now HQ's separate card surface. */}
      {alerts.length > 0 && (
        <div className="absolute bottom-0.5 right-0.5 z-30" onClick={(e) => e.stopPropagation()}>
          <DispatchCardAlertBadge
            alerts={alerts}
            size="sm"
            onResolve={onAlertResolve}
            onRetry={onAlertRetry}
            onNavigate={onAlertNavigate}
          />
        </div>
      )}
      <div className={cn("flex-1 min-w-0 px-1.5 py-1 flex flex-col gap-0.5 overflow-hidden", isTiny && "py-0.5")}>
        {/* Row 1: route order + checkbox/emoji + customer name + travel badge + initials */}
        <div className="flex items-center gap-1 min-w-0">
          {routeInfo && visibleFields?.travelTime !== false && (
            <span className="text-[8px] font-bold bg-white/30 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center shrink-0">
              {routeInfo.order}
            </span>
          )}
          {bulkMode && (
            <input
              type="checkbox"
              checked={!!selected}
              onClick={handleCheckbox}
              onChange={() => {}}
              className="h-3 w-3 shrink-0 rounded border-white/50 accent-white cursor-pointer"
            />
          )}
          {visibleFields?.customerTags !== false && <span className="text-[10px] shrink-0">{emoji}</span>}
          <span className="text-[11px] font-semibold text-white flex-1 break-words leading-tight">
            {visibleFields?.customer === false ? (number || tag) : (item.customer_name || "No Name")}
          </span>
          {routeInfo?.travelMin != null && visibleFields?.travelTime !== false && (
            <span className={cn("text-[8px] font-bold text-white px-1 py-0 rounded flex items-center gap-0.5 shrink-0", travelColor)}>
              <Car className="h-2.5 w-2.5" />
              {routeInfo.travelMin}m
            </span>
          )}
          {initials && !isCompact && visibleFields?.team !== false && (
            <span className="text-[8px] font-bold bg-white/25 text-white rounded-full w-4 h-4 flex items-center justify-center shrink-0">
              {initials}
            </span>
          )}
        </div>

        {/* Row 2: Tag + Time. 2026-05-04: time is always shown (when present)
            — it's the most valuable field on a calendar card. The full row
            including tag/amount only renders on non-tiny / non-compact cards. */}
        {isTiny && !isCompact && showTime && timeStr && visibleFields?.arrivalWindow !== false && (
          <span className="text-[9px] text-white/80 flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5 shrink-0" />
            {timeStr}
          </span>
        )}
        {!isTiny && !isCompact && (
          <div className="flex items-center gap-1 flex-wrap">
            {visibleFields?.customerTags !== false && <span className="text-[8px] font-bold uppercase px-1 py-0 rounded bg-white/20 text-white">
              {tag}
            </span>}
            {showTime && timeStr && visibleFields?.arrivalWindow !== false && (
              <span className="text-[9px] text-white/80 flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {timeStr}
              </span>
            )}
            {amount != null && visibleFields?.amount && (
              <span className="text-[9px] font-bold text-white/90">
                ${Number(amount).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Row 3: Address (expanded or comfortable non-small) */}
        {!isSmall && !isCompact && item.address && visibleFields?.street !== false && (
          <p className="text-[9px] text-white/70 flex items-center gap-0.5 break-words leading-tight">
            <MapPin className="h-2.5 w-2.5 shrink-0" />{street}{visibleFields?.zip && zip ? `, ${zip}` : ""}
          </p>
        )}

        {/* Row 4: Description (expanded only) */}
        {isExpanded && !isSmall && item.description && visibleFields?.description !== false && (
          <p className="text-[9px] text-white/70 break-words leading-tight">{item.description}</p>
        )}

        {/* Row 5: Phone */}
        {!isSmall && !isCompact && item.customer_phone && visibleFields?.phone && (
          <span className="text-[9px] text-white/70 flex items-center gap-0.5">
            <Phone className="h-2.5 w-2.5 shrink-0" />
            {formatPhone(item.customer_phone) || item.customer_phone}
          </span>
        )}

        {/* Row 6: Job number */}
        {!isTiny && !isCompact && number && visibleFields?.jobNumber !== false && (
          <span className="text-[8px] text-white/50 font-medium">{number}</span>
        )}
      </div>
    </div>
  );

  return (
    <HoverCard openDelay={400} closeDelay={150}>
      <HoverCardTrigger asChild>
        {cardContent}
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-72 p-0 overflow-hidden z-50">
        <CardPopover
          item={item}
          techColor={techColor}
          routeInfo={routeInfo}
          visibleFields={visibleFields}
          alerts={alerts}
          onAlertResolve={onAlertResolve}
          onAlertRetry={onAlertRetry}
          onAlertNavigate={onAlertNavigate}
          onAlertAction={onAlertAction}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

// ── Hover Popover Content ──
function CardPopover({
  item,
  techColor,
  routeInfo,
  visibleFields,
  alerts = [],
  onAlertResolve,
  onAlertRetry,
  onAlertNavigate,
  onAlertAction,
}: {
  item: BoardItem;
  techColor: string;
  routeInfo?: { order: number; travelMin: number | null; fromLabel: string | null };
  visibleFields?: CalendarVisibleFields;
  // 2026-05-04: Alerts now render INSIDE the main hover popover instead of in
  // a second floating popover anchored to the corner badge. Single source of
  // dispatcher attention per card.
  alerts?: DispatchAlert[];
  onAlertResolve?: (alert: DispatchAlert) => void;
  onAlertRetry?: (alert: DispatchAlert) => void;
  onAlertNavigate?: (alert: DispatchAlert) => void;
  onAlertAction?: (alert: DispatchAlert, kind?: import("@/hooks/useDispatchCardAlerts").DispatchAlertActionKind, target?: string) => void;
}) {
  const navigate = useNavigate();
  const openQuickQuote = () => {
    const params = new URLSearchParams();
    if (item.item_type === "estimate") params.set("estimate_id", item.id);
    else params.set("job_id", item.id);
    if (item.customer_name) params.set("customer_name", item.customer_name);
    if (item.customer_phone) params.set("customer_phone", item.customer_phone);
    navigate(`/quick-quote?${params.toString()}`);
  };
  const emoji = JOB_TYPE_EMOJI[item.job_type] || "🔧";
  const tag = JOB_TYPE_TAG[item.job_type] || "SERV";

  const number = item.item_type === "estimate"
    ? (item.estimate_number ? `Est #${item.estimate_number}` : null)
    : ((item.job_number || item.hcp_job_number) ? `Job #${item.job_number || item.hcp_job_number}` : null);

  const timeStr = item.arrival_start
    ? `${formatTime(item.arrival_start)}${item.arrival_end ? ` – ${formatTime(item.arrival_end)}` : ""}`
    : null;

  const scheduledDate = item.scheduled_date
    ? format(new Date(item.scheduled_date + "T00:00:00"), "EEE, MMM d, yyyy")
    : null;

  const Icon = item.item_type === "estimate" ? ClipboardList : Wrench;
  const jarvisContext = {
    id: item.id,
    source: "week_dispatch_card_popover",
    record_type: item.item_type,
    customer_id: item.customer_id,
    customer_name: item.customer_name,
    customer_phone: item.customer_phone,
    address: item.address,
    description: item.description,
    assigned_to: item.assigned_to,
    scheduled_date: item.scheduled_date,
    arrival_start: item.arrival_start,
    arrival_end: item.arrival_end,
    job_type: item.job_type,
    status: item.status || item.work_status,
    job_number: item.job_number || item.hcp_job_number,
    estimate_number: item.estimate_number,
    route_order: routeInfo?.order,
    travel_minutes: routeInfo?.travelMin,
  };

  return (
    <div>
      {/* Header bar */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: techColor }}>
        <Icon className="h-4 w-4 text-white/90" />
        <span className="text-sm font-bold text-white flex-1 truncate">
          {number || `${emoji} ${tag}`}
        </span>
        {item.work_status && (
          <span className="text-[9px] bg-white/25 text-white px-1.5 py-0.5 rounded font-medium uppercase">
            {item.work_status}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5">
        {/* 2026-05-04: Action-required alerts. Renders inline at the top of
            the popover so dispatchers see the workflow blockers + their
            resolution buttons together with the customer details — instead
            of in a separate second popover that overlapped the card. Each
            alert can offer multiple resolution paths (e.g. deposit alert
            shows "Mark deposit received" + "Customer financed"). */}
        {alerts.length > 0 && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50/80 p-2.5 dark:border-amber-800/70 dark:bg-amber-950/30">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                {alerts.length} action{alerts.length === 1 ? "" : "s"} required
              </span>
            </div>
            <div className="space-y-2">
              {alerts.map((alert) => {
                const handlePrimary = () => {
                  if (onAlertAction) onAlertAction(alert);
                  else if (alert.actionKind === "navigate") onAlertNavigate?.(alert);
                  else if (alert.actionKind === "rpc_retry") onAlertRetry?.(alert);
                  else onAlertResolve?.(alert);
                };
                return (
                  <div key={alert.id} className="rounded border border-amber-200 bg-background p-2 dark:border-amber-900/60 dark:bg-card">
                    <div className="text-xs font-semibold text-foreground">{alert.label}</div>
                    {alert.detail && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{alert.detail}</div>
                    )}
                    {(alert.actionLabel || (alert.secondaryActions && alert.secondaryActions.length > 0)) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {alert.actionLabel && (
                          <Button size="sm" variant="default" className="h-7 text-[11px] px-2.5 gap-1" onClick={handlePrimary}>
                            {alert.actionLabel}
                          </Button>
                        )}
                        {alert.secondaryActions?.map((sec, idx) => (
                          <Button
                            key={`${alert.id}-sec-${idx}`}
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] px-2.5"
                            onClick={() => onAlertAction?.(alert, sec.kind, sec.target)}
                          >
                            {sec.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Date & Time */}
        {(scheduledDate || (timeStr && visibleFields?.arrivalWindow !== false)) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{scheduledDate}{timeStr && visibleFields?.arrivalWindow !== false ? ` · ${timeStr}` : ""}</span>
          </div>
        )}

        {/* Travel Time */}
        {routeInfo?.travelMin != null && visibleFields?.travelTime !== false && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Car className="h-3.5 w-3.5 shrink-0" />
            <span>
              Stop #{routeInfo.order} · {routeInfo.travelMin} min drive
              {routeInfo.fromLabel ? ` from ${routeInfo.fromLabel}` : ""}
            </span>
          </div>
        )}

        {/* Customer Name */}
        {visibleFields?.customer !== false && <div className="text-sm font-semibold text-foreground">
          {item.customer_name || "No Name"}
        </div>}

        {/* Address */}
        {item.address && visibleFields?.street !== false && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{item.address}</span>
          </div>
        )}

        {/* Phone + Quick Actions */}
        {item.customer_phone && visibleFields?.phone && (
          <div className="flex items-center gap-2">
            <ClickToCall phone={item.customer_phone} contactName={item.customer_name || undefined} jobId={item.id} className="text-xs text-muted-foreground hover:text-primary" iconClassName="h-3.5 w-3.5" />
            <SmsButton phone={item.customer_phone} iconClassName="h-3.5 w-3.5" />
          </div>
        )}

        {/* Quote builder */}
        <Button size="sm" variant="default" className="w-full gap-1.5 h-8" onClick={openQuickQuote}>
          <Zap className="h-3.5 w-3.5" />
          Build Quote
        </Button>
        <AskJarvisButton
          contextType={item.item_type === "estimate" ? "estimate" : "job"}
          contextId={item.id}
          label="Ask JARVIS"
          context={jarvisContext}
          variant="outline"
          className="h-8 w-full justify-center"
        />

        {/* Description */}
        {item.description && visibleFields?.description !== false && (
          <p className="text-xs text-muted-foreground border-t pt-2">{item.description}</p>
        )}

        {/* Assigned tech */}
        {item.assigned_to && visibleFields?.team !== false && (
          <div className="flex items-center gap-2 border-t pt-2">
            <span className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center shrink-0" style={{ backgroundColor: techColor }}>
              {item.assigned_to.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
            </span>
            <span className="text-xs text-foreground font-medium">{item.assigned_to}</span>
          </div>
        )}
      </div>
    </div>
  );
}
