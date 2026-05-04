import { Headphones, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  /** call_log.direction */
  direction: string;
  /** call_log.status */
  status: string;
  /** call_log.extracted_data — may contain overflow_to + overflow_reason */
  extractedData: Record<string, unknown> | null | undefined;
  className?: string;
  size?: "sm" | "xs";
}

/**
 * Visual tag indicating who actually answered an inbound call:
 *   • "Answer Service" → call was overflowed to the 24/7 answering service
 *   • "Dispatcher"     → call was completed by an internal employee
 *
 * Hidden for outbound calls and for calls that never connected (no-answer/busy/failed
 * with no overflow tag).
 */
export function AnsweredByBadge({ direction, status, extractedData, className, size = "xs" }: Props) {
  if (direction !== "inbound") return null;

  const overflowTo = extractedData?.overflow_to as string | undefined;
  const overflowReason = extractedData?.overflow_reason as string | undefined;

  // Overflowed to answering service
  if (overflowTo) {
    const reasonLabel =
      overflowReason === "after_hours" ? "after hours" :
      overflowReason === "busy" ? "we were on a call" :
      overflowReason === "no-answer" ? "no answer" :
      overflowReason === "failed" || overflowReason === "canceled" ? "call failed" :
      null;

    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-primary/40 bg-primary/10 text-primary font-medium",
          size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs",
          className
        )}
        title={reasonLabel ? `Overflowed to answering service — ${reasonLabel}` : "Answered by 24/7 answering service"}
      >
        <Headphones className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
        Answer Service
      </Badge>
    );
  }

  // Internal dispatcher answered (only flag completed inbound calls)
  if (status === "completed") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] font-medium",
          size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs",
          className
        )}
        title="Answered by your dispatcher"
      >
        <UserCheck className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
        Dispatcher
      </Badge>
    );
  }

  return null;
}
