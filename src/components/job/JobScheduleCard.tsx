/**
 * JobScheduleCard.tsx — Single source of truth for job/estimate cards.
 *
 * Used by:
 *   • Dispatch DayCalendarBoard / WeekCalendarBoard (desktop)
 *   • Tech mobile schedule (TechMySchedule)
 *
 * Keep one card spec. Don't fork.
 */

import { format } from "date-fns";
import { Clock, Phone, MapPin, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarVisibleFields } from "@/components/job/CalendarSettings";

const JOB_TYPE_EMOJI: Record<string, string> = {
  service: "🔧", install: "🏗️", maintenance: "🔄", estimate: "📋", phone_call: "📞",
};
const JOB_TYPE_TAG: Record<string, string> = {
  service: "SERV", install: "INST", maintenance: "MAINT", estimate: "EST", phone_call: "CALL",
};

function formatTime(dateStr: string) {
  try { return format(new Date(dateStr), "h:mma").toLowerCase(); } catch { return ""; }
}

export interface JobCardItem {
  id: string;
  item_type?: "job" | "estimate";
  customer_name?: string | null;
  address?: string | null;
  job_type?: string;
  hcp_job_number?: string | null;
  job_number?: string | null;
  customer_phone?: string | null;
  arrival_start?: string | null;
  arrival_end?: string | null;
  estimate_number?: string | null;
  amount?: number | null;
  total?: number | null;
  total_amount?: number | null;
}

export interface JobCardRouteInfo {
  order: number;
  travelMin: number | null;
  fromLabel: string | null;
}

interface Props {
  item: JobCardItem;
  techColor: string;
  routeInfo?: JobCardRouteInfo;
  visibleFields?: CalendarVisibleFields;
  /** When true, hide address + phone for tighter rows */
  compact?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function JobScheduleCard({
  item, techColor, routeInfo, visibleFields, compact = false, onClick, className, style,
}: Props) {
  const jobType = item.job_type || "service";
  const emoji = JOB_TYPE_EMOJI[jobType] || "🔧";
  const tag = JOB_TYPE_TAG[jobType] || "SERV";

  const timeStr = item.arrival_start
    ? `${formatTime(item.arrival_start)}${item.arrival_end ? `–${formatTime(item.arrival_end)}` : ""}`
    : null;

  const number = item.item_type === "estimate"
    ? (item.estimate_number ? `Est #${item.estimate_number}` : null)
    : ((item.job_number || item.hcp_job_number) ? `Job #${item.job_number || item.hcp_job_number}` : null);

  const travelColor = routeInfo?.travelMin != null
    ? routeInfo.travelMin <= 15 ? "bg-emerald-500/80"
      : routeInfo.travelMin <= 30 ? "bg-amber-500/80"
      : "bg-red-500/80"
    : null;
  const amount = item.amount ?? item.total_amount ?? item.total ?? null;
  const addressParts = (item.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  const street = addressParts[0] || item.address;
  const zip = item.address?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative isolation-isolate h-full rounded-md cursor-pointer overflow-hidden flex flex-col transition-shadow hover:shadow-lg hover:brightness-110 border border-white/40 ring-1 ring-black/10 shadow-md",
        className
      )}
      style={{ backgroundColor: techColor, ...style }}
    >
      <div className="absolute inset-0 -z-10 bg-black/28" aria-hidden="true" />
      <div className="flex-1 min-w-0 px-2 py-1.5 flex flex-col gap-0.5 overflow-hidden">
        {/* Row 1: route# · emoji · name · travel pill */}
        <div className="flex items-center gap-1 min-w-0">
          {routeInfo && visibleFields?.travelTime !== false && (
            <span className="text-[9px] font-bold bg-white/30 text-white rounded-full w-4 h-4 flex items-center justify-center shrink-0">
              {routeInfo.order}
            </span>
          )}
          {visibleFields?.customerTags !== false && <span className="text-[11px] shrink-0">{emoji}</span>}
          <span className="text-[12px] font-semibold text-white flex-1 leading-tight">
            {visibleFields?.customer === false ? (number || tag) : (item.customer_name || "No Name")}
          </span>
          {routeInfo?.travelMin != null && visibleFields?.travelTime !== false && (
            <span className={cn("text-[9px] font-bold text-white px-1 py-0.5 rounded flex items-center gap-0.5 shrink-0", travelColor)}>
              <Car className="h-3 w-3" />
              {routeInfo.travelMin}m
            </span>
          )}
        </div>

        {/* Row 2: tag + time */}
        <div className="flex items-center gap-1 flex-wrap">
          {visibleFields?.customerTags !== false && <span className="text-[9px] font-bold uppercase px-1 py-0 rounded bg-white/20 text-white">{tag}</span>}
          {timeStr && visibleFields?.arrivalWindow !== false && (
            <span className="text-[10px] text-white/80 flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {timeStr}
            </span>
          )}
          {amount != null && visibleFields?.amount && (
            <span className="text-[10px] font-bold text-white/90">
              ${Number(amount).toLocaleString()}
            </span>
          )}
        </div>

        {/* Row 3: address */}
        {!compact && item.address && visibleFields?.street !== false && (
          <p className="text-[10px] text-white/70 flex items-center gap-0.5 leading-tight">
            <MapPin className="h-3 w-3 shrink-0" />{street}{visibleFields?.zip && zip ? `, ${zip}` : ""}
          </p>
        )}

        {/* Row 4: phone */}
        {!compact && item.customer_phone && visibleFields?.phone && (
          <span className="text-[10px] text-white/70 flex items-center gap-0.5">
            <Phone className="h-3 w-3 shrink-0" />
            {item.customer_phone}
          </span>
        )}

        {/* Row 5: job number */}
        {number && visibleFields?.jobNumber !== false && (
          <span className="text-[9px] text-white/50 font-medium">{number}</span>
        )}

        {/* Row 6: travel from label */}
        {routeInfo?.fromLabel && routeInfo.travelMin != null && visibleFields?.travelTime !== false && (
          <span className="text-[9px] text-white/50 italic">
            {routeInfo.travelMin} min from {routeInfo.fromLabel}
          </span>
        )}
      </div>
    </div>
  );
}
