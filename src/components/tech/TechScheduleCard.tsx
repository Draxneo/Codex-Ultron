/**
 * TechScheduleCard.tsx - Tech schedule card.
 * Shows From / To times, arrival window, assigned tech, and a pencil → reschedule.
 */

import { Card } from "@/components/ui/card";
import { Calendar, Clock, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { RescheduleButton } from "@/components/job/RescheduleButton";
import { cn } from "@/lib/utils";

interface TechScheduleCardProps {
  jobId: string;
  jobNumber?: string | null;
  scheduledDate: string | null;
  arrivalStart: string | null;
  arrivalEnd: string | null;
  assignedTo: string | null;
  /** Render without outer Card chrome */
  bare?: boolean;
}

function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), "h:mm a");
  } catch {
    return null;
  }
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return format(parseISO(d + (d.length === 10 ? "T00:00:00" : "")), "EEE, MMM d");
  } catch {
    return null;
  }
}

function arrivalWindowMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  try {
    const s = parseISO(start).getTime();
    const e = parseISO(end).getTime();
    return Math.round((e - s) / 60000);
  } catch {
    return null;
  }
}

export function TechScheduleCard({
  jobId,
  jobNumber,
  scheduledDate,
  arrivalStart,
  arrivalEnd,
  assignedTo,
  bare = false,
}: TechScheduleCardProps) {
  const date = fmtDate(scheduledDate);
  const start = fmtTime(arrivalStart);
  const end = fmtTime(arrivalEnd);
  const window = arrivalWindowMinutes(arrivalStart, arrivalEnd);

  const body = (
    <div className={cn("space-y-2.5", bare ? "p-4" : "")}>
      {!bare && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Schedule</h3>
          <RescheduleButton jobId={jobId} jobNumber={jobNumber} />
        </div>
      )}
      {bare && (
        <div className="flex justify-end -mt-1">
          <RescheduleButton jobId={jobId} jobNumber={jobNumber} />
        </div>
      )}
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{date || "Not scheduled"}</span>
        </div>
        {(start || end) && (
          <div className="flex items-center gap-2 text-foreground">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {start && end ? `${start} → ${end}` : (start || end)}
              {window ? <span className="text-xs text-muted-foreground ml-2">({window} min window)</span> : null}
            </span>
          </div>
        )}
        {assignedTo && (
          <div className="flex items-center gap-2 text-foreground">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{assignedTo}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (bare) return body;
  return <Card className="p-4">{body}</Card>;
}
