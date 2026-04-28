import { useMemo } from "react";
import { format, isToday } from "date-fns";
import { Clock, Phone, MapPin, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import type { CalendarVisibleFields, CardDensity } from "@/components/job/CalendarSettings";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import { useHistoricalWeather } from "@/hooks/useHistoricalWeather";
import { WeatherBadge } from "@/components/weather/WeatherBadge";
import { format as formatDate } from "date-fns";
import { getUsHolidayName } from "@/lib/usHolidays";

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
  service: "🔧", install: "🏗️", maintenance: "🔄", estimate: "📋", phone_call: "📞",
};
const JOB_TYPE_TAG: Record<string, string> = {
  service: "SERV", install: "INST", maintenance: "MAINT", estimate: "EST", phone_call: "CALL",
};

const TECH_HEX_PALETTE = [
  "#0d7377", "#1e3a5f", "#8b7d3c", "#1b1b6b", "#c0392b",
  "#2e7d32", "#6a1b9a", "#d84315", "#00695c", "#4e342e",
];
const UNASSIGNED_COLOR = "#64748b";

const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 21;
const BUSINESS_START_HOUR = 7;
const BUSINESS_END_HOUR = 19;
const HOUR_HEIGHT = 80; // taller for single day view

function formatTime(dateStr: string) {
  try { return format(new Date(dateStr), "h:mma").toLowerCase(); } catch { return ""; }
}

interface DayCalendarBoardProps {
  dayItems: BoardItem[];
  employees: any[] | undefined;
  onItemClick: (item: BoardItem) => void;
  currentDay: Date;
  routeOrders?: Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>;
  cardDensity?: CardDensity;
  visibleFields?: CalendarVisibleFields;
  businessHoursOnly?: boolean;
  showHolidays?: boolean;
}

export function DayCalendarBoard({ dayItems, employees, onItemClick, currentDay, routeOrders, cardDensity = "comfortable", visibleFields, businessHoursOnly = false, showHolidays = false }: DayCalendarBoardProps) {
  const startHour = businessHoursOnly ? BUSINESS_START_HOUR : DEFAULT_START_HOUR;
  const endHour = businessHoursOnly ? BUSINESS_END_HOUR : DEFAULT_END_HOUR;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;
  const isTodayDay = isToday(currentDay);
  const dayKey = formatDate(currentDay, "yyyy-MM-dd");
  const { data: forecastMap } = useWeatherForecast();
  const { data: historicalMap } = useHistoricalWeather([dayKey]);
  const todayForecast = forecastMap?.get(dayKey) || historicalMap?.get(dayKey);

  const empColorMap = useMemo(() => {
    const m = new Map<string, string>();
    (employees || []).forEach((emp: any, i: number) => {
      m.set(emp.name, TECH_HEX_PALETTE[i % TECH_HEX_PALETTE.length]);
    });
    return m;
  }, [employees]);

  // Layout: group by tech, then position within each tech lane
  const techLanes = useMemo(() => {
    const byTech = new Map<string, BoardItem[]>();
    const untimed: BoardItem[] = [];

    for (const item of dayItems) {
      if (!item.arrival_start) {
        untimed.push(item);
        continue;
      }
      const tech = item.assigned_to || "Unassigned";
      if (!byTech.has(tech)) byTech.set(tech, []);
      byTech.get(tech)!.push(item);
    }

    // Sort techs by first appointment
    const sorted = [...byTech.entries()].sort((a, b) => {
      const aFirst = a[1][0]?.arrival_start || "";
      const bFirst = b[1][0]?.arrival_start || "";
      return aFirst.localeCompare(bFirst);
    });

    return { lanes: sorted, untimed };
  }, [dayItems]);

  function getPosition(item: BoardItem) {
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
      return { top: (startH - startHour) * HOUR_HEIGHT, height: Math.max((endH - startH) * HOUR_HEIGHT, 60) };
    } catch { return null; }
  }

  const LANE_WIDTH = 240;

  return (
    <div className="flex-1 overflow-auto min-h-0 fat-scrollbar">
      <div className="inline-flex min-w-full">
        <div className="flex">
          {/* Time gutter */}
          <div className="w-[60px] shrink-0">
            <div className="min-h-[64px] border-b border-r bg-card flex flex-col items-center justify-center gap-1 px-2 py-2">
              <span className={cn("text-[10px] font-bold uppercase", isTodayDay ? "text-primary" : "text-muted-foreground")}>
                {format(currentDay, "EEE d")}
              </span>
              {showHolidays && getUsHolidayName(currentDay) && (
                <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-300 text-center leading-tight">
                  {getUsHolidayName(currentDay)}
                </span>
              )}
              <WeatherBadge forecast={todayForecast} />
            </div>
            <div className="relative border-r" style={{ height: totalHeight }}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute w-full border-b border-border/30 flex items-start justify-end pr-2 pt-0.5"
                  style={{ top: (hour - startHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                >
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tech lanes */}
          {techLanes.lanes.map(([techName, items]) => {
            const techColor = empColorMap.get(techName) || UNASSIGNED_COLOR;
            return (
              <div key={techName} className="shrink-0" style={{ width: LANE_WIDTH }}>
                {/* Tech header */}
                <div
                  className="h-10 border-b border-r flex items-center gap-2 px-3"
                  style={{ backgroundColor: techColor + "20" }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ backgroundColor: techColor }}
                  >
                    {techName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                  </span>
                  <span className="text-xs font-semibold truncate">{techName}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{items.length} jobs</span>
                </div>

                {/* Time grid + cards */}
                <div className="relative border-r" style={{ height: totalHeight }}>
                  {hours.map((hour) => (
                    <div key={hour} className="absolute w-full border-b border-border/20" style={{ top: (hour - startHour) * HOUR_HEIGHT, height: HOUR_HEIGHT }} />
                  ))}

                  {items.map((item) => {
                    const pos = getPosition(item);
                    if (!pos) return null;
                    const routeInfo = routeOrders?.get(item.id);
                    return (
                      <div
                        key={item.id}
                        className="absolute z-10 px-1"
                        style={{ top: pos.top, height: pos.height, left: 0, right: 0 }}
                      >
                        <DayCard
                          item={item}
                          onClick={onItemClick}
                          techColor={techColor}
                          height={pos.height}
                          routeInfo={routeInfo}
                          cardDensity={cardDensity}
                          visibleFields={visibleFields}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Untimed items lane */}
          {techLanes.untimed.length > 0 && (
            <div className="shrink-0" style={{ width: LANE_WIDTH }}>
              <div className="h-10 border-b border-r flex items-center px-3 bg-muted/30">
                <span className="text-xs font-semibold text-muted-foreground">Unscheduled</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{techLanes.untimed.length}</span>
              </div>
              <div className="relative border-r p-1 space-y-1" style={{ height: totalHeight }}>
                {techLanes.untimed.map((item) => (
                  <DayCard
                    key={item.id}
                    item={item}
                    onClick={onItemClick}
                    techColor={empColorMap.get(item.assigned_to || "") || UNASSIGNED_COLOR}
                    routeInfo={routeOrders?.get(item.id)}
                    cardDensity={cardDensity}
                    visibleFields={visibleFields}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Day Card (wraps shared JobScheduleCard with hover preview) ──
import { JobScheduleCard } from "@/components/job/JobScheduleCard";

function DayCard({
  item, onClick, techColor, height, routeInfo, cardDensity = "comfortable", visibleFields,
}: {
  item: BoardItem;
  onClick: (item: BoardItem) => void;
  techColor: string;
  height?: number;
  routeInfo?: { order: number; travelMin: number | null; fromLabel: string | null };
  cardDensity?: CardDensity;
  visibleFields?: CalendarVisibleFields;
}) {
  const emoji = JOB_TYPE_EMOJI[item.job_type] || "🔧";
  const tag = JOB_TYPE_TAG[item.job_type] || "SERV";
  const isCompact = cardDensity === "compact";

  const timeStr = item.arrival_start
    ? `${formatTime(item.arrival_start)}${item.arrival_end ? `–${formatTime(item.arrival_end)}` : ""}`
    : null;

  const number = item.item_type === "estimate"
    ? (item.estimate_number ? `Est #${item.estimate_number}` : null)
    : ((item.job_number || item.hcp_job_number) ? `Job #${item.job_number || item.hcp_job_number}` : null);

  return (
    <HoverCard openDelay={400} closeDelay={150}>
      <HoverCardTrigger asChild>
        <div className="h-full">
          <JobScheduleCard
            item={item}
            techColor={techColor}
            routeInfo={routeInfo}
            visibleFields={visibleFields}
            compact={isCompact}
            onClick={() => onClick(item)}
          />
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-72 p-3 z-50 space-y-2">
        <div className="flex items-center gap-2">
          {visibleFields?.customerTags !== false && <span className="text-sm">{emoji}</span>}
          {visibleFields?.customer !== false && <span className="font-semibold text-sm">{item.customer_name || "No Name"}</span>}
          {visibleFields?.customerTags !== false && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: techColor }}>{tag}</span>}
        </div>
        {timeStr && visibleFields?.arrivalWindow !== false && <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{timeStr}</p>}
        {item.address && visibleFields?.street !== false && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{item.address}</p>}
        {item.customer_phone && visibleFields?.phone && (
          <div className="flex items-center gap-2">
            <ClickToCall phone={item.customer_phone} jobId={item.id} className="text-xs" />
            <SmsButton phone={item.customer_phone} className="text-xs" />
          </div>
        )}
        {routeInfo?.travelMin != null && visibleFields?.travelTime !== false && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Car className="h-3 w-3" />
            Stop #{routeInfo.order} · {routeInfo.travelMin} min drive{routeInfo.fromLabel ? ` from ${routeInfo.fromLabel}` : ""}
          </p>
        )}
        {item.description && visibleFields?.description !== false && <p className="text-xs text-muted-foreground">{item.description}</p>}
        {number && visibleFields?.jobNumber !== false && <p className="text-[10px] text-muted-foreground/60">{number}</p>}
      </HoverCardContent>
    </HoverCard>
  );
}
