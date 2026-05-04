/**
 * DispatchCardAlertBadge.tsx — Dispatch calendar card alert badge + hover/popover overlay
 *
 * SYSTEM CONNECTIONS:
 * - Consumes DispatchAlert[] from useDispatchCardAlerts
 * - Renders a small severity-colored pill with alert count + highest-severity label
 * - HoverCard for hover trigger on desktop, click-to-open support for mobile/keyboard
 * - Calls onResolve/onRetry/onNavigate callbacks on action buttons
 *
 * SITS ON:
 * - shadcn HoverCard + Popover primitives
 * - Alert severity color coding (blocked=red, action=amber, info=blue)
 * - useDispatchCardAlertActions hook for mutation handling
 *
 * RENDERING:
 * - Returns null if no alerts
 * - Otherwise small pill: count + label, color-coded by highest severity
 * - Hover/click opens overlay with detailed alert list + per-alert action buttons
 */

import { useMemo, useState } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, Zap, Trash2 } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DispatchAlert } from "@/hooks/useDispatchCardAlerts";

export interface DispatchCardAlertBadgeProps {
  alerts: DispatchAlert[];
  size?: "sm" | "md";
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

function actionIcon(kind?: DispatchAlert["actionKind"]) {
  if (kind === "rpc_resolve") return CheckCircle2;
  if (kind === "rpc_retry") return Zap;
  if (kind === "rpc_admin_delete") return Trash2;
  return null;
}

export function DispatchCardAlertBadge({
  alerts,
  size = "sm",
  onResolve,
  onRetry,
  onNavigate,
  onDelete,
  isLoading = false,
}: DispatchCardAlertBadgeProps) {
  const [open, setOpen] = useState(false);

  // Find highest severity for badge display
  const highestSeverity = useMemo(() => {
    if (alerts.some((a) => a.severity === "blocked")) return "blocked";
    if (alerts.some((a) => a.severity === "action")) return "action";
    return "info";
  }, [alerts]);

  // If no alerts, render nothing
  if (alerts.length === 0) return null;

  const colors = severityColor(highestSeverity);
  const SeverityIcon = severityIcon(highestSeverity);
  const topLabel = alerts[0]?.label || "Alert";

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
            colors.bg,
            colors.text,
            colors.border,
            "border cursor-pointer hover:opacity-80"
          )}
          onClick={() => setOpen(!open)}
        >
          <SeverityIcon className="h-3 w-3 shrink-0" />
          <span>{alerts.length}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className={cn("w-80", colors.bg, colors.border, "border")} side="left" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold">{alerts.length} alert{alerts.length !== 1 ? "s" : ""}</h4>
            <p className="text-xs text-muted-foreground">
              {highestSeverity === "blocked" && "Workflow is blocked"}
              {highestSeverity === "action" && "Action required"}
              {highestSeverity === "info" && "FYI"}
            </p>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alerts.map((alert) => {
              const colors2 = severityColor(alert.severity);
              const Icon = severityIcon(alert.severity);
              const ActionIcon = actionIcon(alert.actionKind);

              const handleAction = () => {
                if (alert.actionKind === "rpc_resolve" && onResolve) {
                  onResolve(alert);
                } else if (alert.actionKind === "rpc_retry" && onRetry) {
                  onRetry(alert);
                } else if (alert.actionKind === "navigate" && onNavigate) {
                  onNavigate(alert);
                } else if (alert.actionKind === "rpc_admin_delete" && onDelete) {
                  onDelete(alert);
                }
              };

              return (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-md p-2.5 border text-sm space-y-1.5",
                    colors2.bg,
                    colors2.border
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", colors2.text)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-semibold text-xs", colors2.text)}>{alert.label}</p>
                      {alert.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
                      )}
                    </div>
                  </div>

                  {alert.actionLabel && (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={isLoading}
                      onClick={handleAction}
                      className="w-full h-7 text-xs"
                    >
                      {ActionIcon && <ActionIcon className="h-3 w-3" />}
                      {alert.actionLabel}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
