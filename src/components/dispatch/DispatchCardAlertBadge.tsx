/**
 * DispatchCardAlertBadge.tsx — Visual-only alert pill on dispatch calendar cards
 *
 * SYSTEM CONNECTIONS:
 * - Consumes DispatchAlert[] from useDispatchCardAlerts
 * - Renders a small severity-colored pill with alert count + severity icon
 * - DOES NOT carry its own popover — the action buttons live INSIDE the
 *   main card hover popover (CardPopover in WeekCalendarBoard.tsx) so
 *   dispatchers only have ONE popover to interact with per card.
 *
 * 2026-05-04 simplification: previously this component owned a separate
 * HoverCard with action buttons. That created a second popover that overlapped
 * the main card popover. Now the pill is purely a visual indicator, and
 * action buttons render inline inside CardPopover.
 *
 * RENDERING:
 * - Returns null if no alerts
 * - Otherwise small pill: severity icon + count, color-coded by highest severity
 */

import { useMemo } from "react";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DispatchAlert } from "@/hooks/useDispatchCardAlerts";

export interface DispatchCardAlertBadgeProps {
  alerts: DispatchAlert[];
  size?: "sm" | "md";
  /** Legacy callbacks — kept for back-compat with any other consumers, but
   *  unused on the calendar surface (CardPopover handles actions now). */
  onResolve?: (alert: DispatchAlert) => void;
  onRetry?: (alert: DispatchAlert) => void;
  onNavigate?: (alert: DispatchAlert) => void;
  onDelete?: (alert: DispatchAlert) => void;
  isLoading?: boolean;
}

function severityColor(severity: DispatchAlert["severity"]) {
  if (severity === "blocked") return { bg: "bg-red-100 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", border: "border-red-300 dark:border-red-700" };
  if (severity === "action") return { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-300 dark:border-amber-700" };
  return { bg: "bg-blue-100 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" };
}

function severityIcon(severity: DispatchAlert["severity"]) {
  if (severity === "blocked") return AlertTriangle;
  if (severity === "action") return AlertCircle;
  return Info;
}

export function DispatchCardAlertBadge({ alerts, size = "sm" }: DispatchCardAlertBadgeProps) {
  // Find highest severity for badge display
  const highestSeverity = useMemo(() => {
    if (alerts.some((a) => a.severity === "blocked")) return "blocked";
    if (alerts.some((a) => a.severity === "action")) return "action";
    return "info";
  }, [alerts]);

  if (alerts.length === 0) return null;

  const colors = severityColor(highestSeverity);
  const SeverityIcon = severityIcon(highestSeverity);
  const sizeCls = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold border pointer-events-none",
        sizeCls,
        colors.bg,
        colors.text,
        colors.border,
      )}
      // Pointer-events disabled so hover passes through to the underlying
      // calendar card, which is what triggers the unified popover.
      aria-label={`${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"} requiring action`}
    >
      <SeverityIcon className="h-2.5 w-2.5 shrink-0" />
      <span>{alerts.length}</span>
    </span>
  );
}
