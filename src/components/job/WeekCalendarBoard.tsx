import { useMemo, useRef, useEffect, useState } from "react";
import { format, isSameDay, isToday, parseISO, startOfWeek, addDays } from "date-fns";
import { AlertTriangle as AlertTriangleIcon, Clock, Phone, MapPin, Wrench, ClipboardList, Calendar, Car, HardHat, Loader2, Zap, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { BusinessUnitLite } from "@/hooks/useJobBusinessUnit";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEmployees } from "@/hooks/useEmployees";

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
  // 2026-05-04: Business unit map for calendar cards. Maps customer_id → BusinessUnitLite.
  // Allows WeekCard to render FIX vs C&S badges. Optional so other consumers
  // (Tech mobile) don't have to wire it unless they want BU tags.
  businessUnitsByCustomerId?: Map<string, BusinessUnitLite>;
  // 2026-05-04: Customer tags map for calendar cards. Maps customer_id → string[].
  // Allows WeekCard + CardPopover to render "Comfort Club" and other tags.
  // Optional so other consumers (Tech mobile) don't have to wire it unless they want tags.
  tagsByCustomerId?: Map<string, string[]>;
}

export function WeekCalendarBoard({ weekItems, employees, onItemClick, currentDay, onDayClick, bulkMode, selectedIds, onToggleSelect, routeOrders, cardDensity = "comfortable", visibleFields, businessHoursOnly = false, showHolidays = false, hourHeight = DEFAULT_HOUR_HEIGHT, headerHeight = DEFAULT_HEADER_HEIGHT, alertsByJobId, onAlertResolve, onAlertRetry, onAlertNavigate, onAlertAction, businessUnitsByCustomerId, tagsByCustomerId }: WeekCalendarBoardProps) {
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
                        <WeekCard key={item.id} item={item} onClick={onItemClick} techColor={empColorMap.get(item.assigned_to || "") || UNASSIGNED_COLOR} compact={false} bulkMode={bulkMode} selected={selectedIds?.has(item.id)} onToggleSelect={onToggleSelect} routeInfo={routeOrders?.get(item.id)} cardDensity={cardDensity} visibleFields={visibleFields} alerts={alertsByJobId?.get(item.id) || []} onAlertResolve={onAlertResolve} onAlertRetry={onAlertRetry} onAlertNavigate={onAlertNavigate} onAlertAction={onAlertAction} businessUnit={businessUnitsByCustomerId?.get(item.customer_id || "")} />
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
                          businessUnit={businessUnitsByCustomerId?.get(item.customer_id || "")}
                          tags={tagsByCustomerId?.get(item.customer_id || "") || []}
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
  businessUnit,
  tags = [],
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
  // 2026-05-04: Business unit info for the card (FIX vs Carnes). If present,
  // renders a small pill badge on the card. Optional so other consumers
  // (Tech mobile) don't have to wire it.
  businessUnit?: BusinessUnitLite | null;
  // 2026-05-04: Customer tags (e.g., "Comfort Club"). Rendered as pills when
  // visibleFields?.customerTags is not false. Optional — defaults to empty array
  // so Tech mobile doesn't have to wire it.
  tags?: string[];
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
        {/* Row 1: route order + checkbox/emoji + customer name + travel badge + initials + BU badge */}
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
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
          {/* 2026-05-04: Business unit pill badge. Small inline tag showing FIX or C&S.
              Uses tinted background colors: carnes=blue/neutral, fix-construction=orange/amber.
              Matches the intake badge styling from OperationsDeskV2. Hidden if no BU resolved. */}
          {businessUnit && (
            <span className={cn(
              "text-[8px] font-bold rounded-full px-1.5 py-0.5 shrink-0 whitespace-nowrap",
              businessUnit.slug === "fix-construction"
                ? "bg-cyan-400/80 text-slate-950"
                : "bg-blue-400/80 text-slate-950"
            )}>
              {businessUnit.slug === "fix-construction" ? "FIX" : "C&S"}
            </span>
          )}
          {/* 2026-05-04: Customer tags pills. Gated by visibleFields?.customerTags.
              Renders "Comfort Club" with a gold Crown icon, other tags as neutral. */}
          {visibleFields?.customerTags !== false && tags && tags.length > 0 && (
            <>
              {tags.includes("Comfort Club") && (
                <span className="flex items-center gap-0.5 text-[8px] font-bold rounded-full px-1.5 py-0.5 shrink-0 whitespace-nowrap bg-amber-400/80 text-slate-950">
                  <Crown className="h-2.5 w-2.5" />
                  CC
                </span>
              )}
              {tags.filter(t => t !== "Comfort Club").map((tag) => (
                <span key={tag} className="text-[8px] font-bold rounded-full px-1.5 py-0.5 shrink-0 whitespace-nowrap bg-white/20 text-white">
                  {tag.substring(0, 3).toUpperCase()}
                </span>
              ))}
            </>
          )}
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
          businessUnit={businessUnit}
          tags={tags}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * 2026-05-04: getJobNextStep — given a calendar item, returns the next
 * unfulfilled workflow step as a human label. Used by CardPopover to render
 * the "Next" line so dispatchers can always see where the job is in its
 * lifecycle on hover, not just when something errors.
 *
 * The check order mirrors INSTALL_WORKFLOW / SERVICE_WORKFLOW from
 * src/lib/workflowNow.ts but is intentionally independent: we don't need
 * the heavy WorkflowNowCard plumbing to surface a single label, and the
 * popover doesn't have access to invoices/parts/cart context anyway.
 *
 * Returns null for fully-completed jobs and estimates we don't track.
 */
function getJobNextStep(item: BoardItem): { label: string; route: string } | null {
  if (item.item_type === "estimate") {
    if (!item.scheduled_date) return { label: "Schedule sales visit", route: `/estimates/${item.id}` };
    if (!item.assigned_to) return { label: "Assign sales tech", route: `/estimates/${item.id}` };
    if (!(item as any).confirmation_sent_at) return { label: "Send appointment reminder", route: `/estimates/${item.id}` };
    if (!(item as any).completion_form_sent_at) return { label: "Walk site + present quote", route: `/estimates/${item.id}` };
    if (!(item as any).presentation_sent_at) return { label: "Send presentation", route: `/estimates/${item.id}` };
    return { label: "Win/lose decision", route: `/estimates/${item.id}` };
  }

  // jobs ─────────────────────────────────────────────────────────────────
  const route = `/jobs/${item.id}`;
  const isInstall = item.job_type === "install";

  if (!item.scheduled_date) return { label: "Schedule date", route };
  if (!item.assigned_to) return { label: isInstall ? "Assign installer" : "Assign tech", route };

  if (isInstall) {
    if (!(item as any).equipment_ordered_at) return { label: "Order equipment", route };
    if ((item as any).permit_required && !(item as any).permit_pulled_at) return { label: "Pull permit", route };
    if (!(item as any).deposit_paid_at && (item as any).payment_method !== "financed") {
      return { label: "Collect deposit (or mark financed)", route };
    }
    if ((item as any).payment_method === "financed" && !(item as any).finance_paperwork_at) {
      return { label: "Finance paperwork", route };
    }
  }

  if (!(item as any).confirmation_sent_at) return { label: "Send appointment reminder", route };
  if (!(item as any).dispatch_sent_at) return { label: "Text job details to tech", route };
  if (!(item as any).on_my_way_sent_at) return { label: "Tech to send 'on my way'", route };

  const status = String(item.status || item.work_status || "").toLowerCase();
  const onSite = status === "in_progress" || status === "on_site";
  const done = status === "done" || status === "completed" || status === "complete" || status === "invoiced";
  if (!onSite && !done) return { label: "Tech to arrive on site", route };

  if (!(item as any).completion_form_sent_at) return { label: "Send completion form", route };
  if ((item as any).site_visit_missing && !(item as any).photos_uploaded_at) {
    return { label: "Upload site photos", route };
  }
  if (!(item as any).invoice_sent_at) return { label: "Send invoice", route };
  if (!(item as any).payment_collected_at) return { label: "Collect payment", route };
  if (!(item as any).review_request_sent_at) return { label: "Request review", route };
  if (isInstall && !(item as any).warranty_registered_at) return { label: "Register warranty", route };
  if (isInstall && (item as any).permit_required && !(item as any).inspection_passed_at) {
    return { label: "Schedule inspection", route };
  }
  return null; // fully done
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
  businessUnit,
  tags = [],
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
  // 2026-05-04: Business unit for the popover header. If present, shows the
  // full company name (FIX Construction or Carnes and Sons) next to the job/est number.
  businessUnit?: BusinessUnitLite | null;
  // 2026-05-04: Customer tags (e.g., "Comfort Club"). Rendered prominently
  // under customer name when visibleFields?.customerTags is not false.
  tags?: string[];
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

  // 2026-05-04: Reschedule dialog state + mutation. Lets dispatchers move a
  // job/estimate to a new date+window (and reassign tech) without leaving the
  // calendar popover. Defaults to whatever JARVIS / the current schedule has;
  // dispatcher tweaks via quick time-block buttons or manual time inputs and
  // hits Save. Updates jobs OR estimates table directly + stamps locally_modified_at
  // so the HCP sync's 15-min protection window kicks in (won't be overwritten
  // by an inbound HCP poll). Realtime invalidation refreshes the calendar.
  const queryClient = useQueryClient();
  const { data: employeesList = [] } = useEmployees();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  // Pre-fill defaults from current item state. Time fields are HH:MM strings
  // matching <input type="time"> format.
  const initialDate = item.scheduled_date ? item.scheduled_date.substring(0, 10) : "";
  const initialStart = item.arrival_start ? format(new Date(item.arrival_start), "HH:mm") : "";
  const initialEnd = item.arrival_end ? format(new Date(item.arrival_end), "HH:mm") : "";
  const initialAssignee = item.assigned_to || "";
  const [reschedDate, setReschedDate] = useState(initialDate);
  const [reschedStart, setReschedStart] = useState(initialStart);
  const [reschedEnd, setReschedEnd] = useState(initialEnd);
  const [reschedAssignee, setReschedAssignee] = useState(initialAssignee);
  const detectCentralOffsetSimple = (dateStr: string) => {
    // Reuse the same heuristic as detectCentralOffset in lib/formatters — DST in TX
    // runs roughly 2nd Sunday of March → 1st Sunday of November. Returns "-05:00"
    // (CDT) or "-06:00" (CST). We don't import the lib helper to keep this file
    // self-contained but the math is identical.
    if (!dateStr) return "-05:00";
    const d = new Date(`${dateStr}T12:00:00`);
    const month = d.getMonth(); // 0=Jan
    if (month > 2 && month < 10) return "-05:00"; // Apr–Oct: definitely DST
    if (month < 2 || month > 10) return "-06:00"; // Jan–Feb, Dec: definitely standard
    return "-05:00"; // Mar/Nov edge — defaulting to DST is fine for a calendar
  };
  const reschedule = useMutation({
    mutationFn: async () => {
      if (!reschedDate) throw new Error("Pick a date first");
      const offset = detectCentralOffsetSimple(reschedDate);
      const newStart = reschedStart ? `${reschedDate}T${reschedStart}:00${offset}` : null;
      const newEnd = reschedEnd ? `${reschedDate}T${reschedEnd}:00${offset}` : null;
      const table = item.item_type === "estimate" ? "estimates" : "jobs";
      const updatePayload: Record<string, unknown> = {
        scheduled_date: reschedDate,
        arrival_start: newStart,
        arrival_end: newEnd,
        assigned_to: reschedAssignee || null,
      };
      // jobs has locally_modified_at as the HCP-protection signal; estimates
      // doesn't have it yet so we just skip that field for estimates.
      if (item.item_type !== "estimate") {
        updatePayload.locally_modified_at = new Date().toISOString();
      }
      const { error } = await (supabase as any).from(table).update(updatePayload).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rescheduled", {
        description: `Moved to ${reschedDate}${reschedStart ? ` · ${reschedStart}` : ""}${reschedAssignee ? ` · ${reschedAssignee}` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-card-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stack"] });
      setRescheduleOpen(false);
    },
    onError: (error) => {
      toast.error("Could not reschedule", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  // Quick-pick time blocks. Each click sets start + end. Dispatcher can still
  // tweak the manual inputs after.
  const TIME_BLOCKS = [
    { label: "8–10a", start: "08:00", end: "10:00" },
    { label: "10–12p", start: "10:00", end: "12:00" },
    { label: "1–3p", start: "13:00", end: "15:00" },
    { label: "3–5p", start: "15:00", end: "17:00" },
  ];

  // 2026-05-04 v3: Send-to-subcontractor is now a Dialog flow per Clint:
  //   Click Send to subcontractor →
  //   Dialog opens → backend creates the link → iframe shows the public
  //     /subcontractor/:token page so dispatcher sees what the sub will see →
  //   Dispatcher picks a contractor from the dropdown (active employees with
  //     phone numbers — Tim, Cedric, App, etc.) →
  //   Hit Send → SMS goes out via send-sms with the link in the body, routed
  //     through the customer's business unit so it sends from the right line.
  //   Copy URL fallback if the dispatcher wants to text it manually elsewhere.
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subRecipient, setSubRecipient] = useState<string>(""); // employee.id
  const [subPreviewToken, setSubPreviewToken] = useState<string | null>(null);
  const [subPreviewError, setSubPreviewError] = useState<string | null>(null);
  const subPreviewUrl = subPreviewToken
    ? `${window.location.origin}/subcontractor/${subPreviewToken}`
    : null;
  const subRecipients = (employeesList || [])
    .filter((emp: any) => emp.is_active && emp.phone && ["tech", "supervisor", "installer"].includes(emp.role))
    .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  const subRecipientEmp = subRecipients.find((e: any) => e.id === subRecipient);

  // Auto-create the link when the dialog opens. Uses the same record-aware
  // RPC as the calendar popover so estimates work too. We create the link
  // BEFORE the dispatcher hits Send so the iframe preview is meaningful.
  // If they cancel, the link still exists in the DB but harmless — dispatcher
  // can revoke from /admin if needed.
  const generateSubLink = useMutation({
    mutationFn: async () => {
      const equipmentSummary = [
        (item as any).brand,
        (item as any).tonnage ? `${(item as any).tonnage} ton` : null,
        (item as any).system_type,
      ].filter(Boolean).join(" · ") || null;
      const { data, error } = await (supabase as any).rpc("create_subcontractor_link", {
        p_record_id: item.id,
        p_record_type: item.item_type,
        p_subcontractor_name: null,
        p_subcontractor_phone: null,
        p_scope: item.description || null,
        p_equipment_summary: equipmentSummary,
        p_required_photo_slots: ["arrival", "before", "equipment", "after", "final"],
        p_expires_days: 7,
      });
      if (error) throw error;
      if (!data?.token) throw new Error("RPC returned no token");
      return data as { token: string; path?: string };
    },
    onSuccess: (data) => {
      setSubPreviewToken(data.token);
      setSubPreviewError(null);
    },
    onError: (error) => {
      setSubPreviewError(error instanceof Error ? error.message : "Could not generate link.");
    },
  });

  // Send SMS to chosen recipient with the link embedded.
  const sendSubLinkSms = useMutation({
    mutationFn: async () => {
      if (!subRecipientEmp || !subPreviewUrl) throw new Error("Pick a contractor first");
      const phone = subRecipientEmp.phone;
      const body = `Job info: ${item.customer_name || "Customer"} — ${item.address || "see link"}\n${subPreviewUrl}`;
      const { error } = await (supabase as any).functions.invoke("send-sms", {
        body: {
          to: phone,
          body,
          // Caller's BU isn't known on the calendar card (jobs/estimates don't
          // carry business_unit_id directly); send-sms will fall back to the
          // customer's primary_business_unit_id which we now stamp from the
          // action_item metadata via the trigger added today. Good enough.
          source: "subcontractor-link-share",
          isManual: true,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Link sent to subcontractor", {
        description: `Texted ${subRecipientEmp?.name || "contractor"} the job info.`,
      });
      setSubDialogOpen(false);
    },
    onError: (error) => {
      toast.error("Could not send", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  // Reset state + auto-generate link when dialog opens.
  useEffect(() => {
    if (subDialogOpen && !subPreviewToken && !generateSubLink.isPending && !subPreviewError) {
      generateSubLink.mutate();
    }
    if (!subDialogOpen) {
      // Reset on close so re-opening regenerates a fresh link.
      setSubPreviewToken(null);
      setSubPreviewError(null);
      setSubRecipient("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subDialogOpen]);

  // 2026-05-04: One-click "Send to subcontractor" button. Calls the unified
  // create_subcontractor_job_link RPC (now supporting both jobs and estimates)
  // with sensible defaults so dispatchers can hand a job/estimate to a sub
  // (e.g. Tim) without leaving the calendar. The RPC returns a token; we build
  // the public /subcontractor/:token URL, copy it to clipboard, and offer to
  // open the SMS composer pre-filled with the link if the customer phone is on
  // file. Works for both jobs and estimates identically.
  const createSubcontractorLink = useMutation({
    mutationFn: async () => {
      const equipmentSummary = [
        (item as any).brand,
        (item as any).tonnage ? `${(item as any).tonnage} ton` : null,
        (item as any).system_type,
      ].filter(Boolean).join(" · ") || null;

      // 2026-05-04 fix: switched from create_subcontractor_job_link (which had
      // an ambiguous overload after today's estimate-parity migration) to the
      // new clean create_subcontractor_link RPC. Same job/estimate routing
      // via p_record_type, no overload conflict, no 'Failed to generate link'.
      const { data, error } = await (supabase as any).rpc("create_subcontractor_link", {
        p_record_id: item.id,
        p_record_type: item.item_type,  // 'job' or 'estimate'
        p_subcontractor_name: null,
        p_subcontractor_phone: null,
        p_scope: item.description || null,
        p_equipment_summary: equipmentSummary,
        p_required_photo_slots: ["arrival", "before", "equipment", "after", "final"],
        p_expires_days: 7,
      });
      if (error) throw error;
      return data as { token: string; path?: string; expires_at: string };
    },
    onSuccess: async (data) => {
      const url = `${window.location.origin}/subcontractor/${data.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Subcontractor link copied", {
          description: "Paste into a text to your sub. Link expires in 7 days.",
        });
      } catch {
        toast.success("Subcontractor link created", { description: url });
      }
    },
    onError: (error) => {
      toast.error("Could not create subcontractor link", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });
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
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-white block truncate">
            {number || `${emoji} ${tag}`}
          </span>
          {/* 2026-05-04: Business unit label in popover header. Shows full company name
              (FIX Construction or Carnes and Sons) so dispatchers see the BU at a glance. */}
          {businessUnit && (
            <span className="text-[9px] text-white/75 block truncate font-medium">
              {businessUnit.display_name}
            </span>
          )}
        </div>
        {item.work_status && (
          <span className="text-[9px] bg-white/25 text-white px-1.5 py-0.5 rounded font-medium uppercase shrink-0">
            {item.work_status}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5">
        {/* 2026-05-04: "What's next" — the workflow step this job is currently
            waiting for. Always shown (when there is a next step) so dispatchers
            can see where any job is in its lifecycle without reading the alerts
            section. Click navigates to the job page where the action lives. */}
        {(() => {
          const next = getJobNextStep(item);
          if (!next) return null;
          return (
            <button
              type="button"
              onClick={() => navigate(next.route)}
              className="w-full flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-left transition-colors hover:bg-primary/10"
            >
              <Zap className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-none">
                  Next
                </div>
                <div className="text-sm font-semibold text-foreground leading-tight mt-0.5 truncate">
                  {next.label}
                </div>
              </div>
            </button>
          );
        })()}

        {/* Action-required alerts. Renders inline at the top of
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

        {/* Customer Tags */}
        {visibleFields?.customerTags !== false && tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.includes("Comfort Club") && (
              <span className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-1 bg-amber-400/80 text-slate-950">
                <Crown className="h-3 w-3" />
                Comfort Club
              </span>
            )}
            {tags.filter(t => t !== "Comfort Club").map((tag) => (
              <span key={tag} className="text-[11px] font-bold rounded-full px-2 py-1 bg-slate-200 text-slate-950">
                {tag}
              </span>
            ))}
          </div>
        )}

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

        {/* 2026-05-04 v3: Send-to-subcontractor opens the Dialog flow described
            above. Click → preview the public sub page in an iframe → pick the
            contractor from the dropdown → Send. */}
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 h-8"
          onClick={() => setSubDialogOpen(true)}
        >
          <HardHat className="h-3.5 w-3.5" />
          Send to subcontractor
        </Button>

        <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Send to subcontractor</DialogTitle>
              <DialogDescription>
                Preview what the sub will see, pick a contractor, then send the link.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Preview pane */}
              <div className="rounded-md border bg-muted/30">
                <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Preview
                  </span>
                  {subPreviewUrl && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[260px]">
                        {subPreviewUrl}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(subPreviewUrl);
                            toast.success("URL copied");
                          } catch {
                            toast.info("Could not access clipboard");
                          }
                        }}
                      >
                        Copy URL
                      </Button>
                    </div>
                  )}
                </div>
                {generateSubLink.isPending && (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Generating link…</span>
                  </div>
                )}
                {subPreviewError && (
                  <div className="space-y-2 p-4 text-sm">
                    <p className="text-destructive font-medium">Could not generate link.</p>
                    <p className="text-xs text-muted-foreground">{subPreviewError}</p>
                    <Button size="sm" variant="outline" onClick={() => generateSubLink.mutate()}>
                      Try again
                    </Button>
                  </div>
                )}
                {subPreviewUrl && !generateSubLink.isPending && (
                  <iframe
                    title="Subcontractor preview"
                    src={subPreviewUrl}
                    className="h-[420px] w-full bg-slate-950"
                  />
                )}
              </div>

              {/* Recipient picker */}
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Assign contractor
                </Label>
                <select
                  value={subRecipient}
                  onChange={(e) => setSubRecipient(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">— Pick a contractor —</option>
                  {subRecipients.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} · {emp.phone}
                    </option>
                  ))}
                </select>
                {subRecipients.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No active techs/installers with phone numbers in your roster. Add one in admin → Roster.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSubDialogOpen(false)}
                disabled={sendSubLinkSms.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => sendSubLinkSms.mutate()}
                disabled={!subRecipient || !subPreviewUrl || sendSubLinkSms.isPending}
                className="gap-2"
              >
                {sendSubLinkSms.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <HardHat className="h-4 w-4" />
                    Send
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 2026-05-04: Reschedule button — opens a focused dialog to pick a new
            date, time block, and (optionally) reassign tech. No need to leave
            the calendar popover. Updates jobs/estimates directly + stamps
            locally_modified_at to protect the change from the HCP sync. */}
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 h-8"
          onClick={() => setRescheduleOpen(true)}
        >
          <Calendar className="h-3.5 w-3.5" />
          Reschedule
        </Button>

        <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reschedule {item.item_type === "estimate" ? "Estimate" : "Job"}</DialogTitle>
              <DialogDescription>
                {item.customer_name || "Customer"} · {item.address || "no address"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={reschedDate}
                  onChange={(e) => setReschedDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Time block (quick pick)</Label>
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {TIME_BLOCKS.map((block) => {
                    const active = reschedStart === block.start && reschedEnd === block.end;
                    return (
                      <Button
                        key={block.label}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="h-9 text-xs"
                        onClick={() => {
                          setReschedStart(block.start);
                          setReschedEnd(block.end);
                        }}
                      >
                        {block.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Arrival start</Label>
                  <Input
                    type="time"
                    value={reschedStart}
                    onChange={(e) => setReschedStart(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Arrival end</Label>
                  <Input
                    type="time"
                    value={reschedEnd}
                    onChange={(e) => setReschedEnd(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned tech</Label>
                <select
                  value={reschedAssignee}
                  onChange={(e) => setReschedAssignee(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">Unassigned</option>
                  {(employeesList || [])
                    .filter((emp: any) => emp.is_active && ["tech", "supervisor", "admin", "installer"].includes(emp.role))
                    .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                    .map((emp: any) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRescheduleOpen(false)}
                disabled={reschedule.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => reschedule.mutate()}
                disabled={!reschedDate || reschedule.isPending}
                className="gap-2"
              >
                {reschedule.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
