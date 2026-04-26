import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X, ExternalLink } from "lucide-react";
import { useApiCostAlerts } from "@/hooks/useApiCostAlerts";
import { useActiveJobCount } from "@/hooks/useActiveJobCount";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

/**
 * Global red banner shown above the AppHeader when ANY API service is running
 * 3× over its dynamic expected ceiling (baseline + per-job × jobs on board).
 * Visible to admins only. Polls every 60s via useApiCostAlerts.
 */
export function ApiCostAlertBanner() {
  const { role } = useAuth();
  const { data: activeJobCount = 0 } = useActiveJobCount();
  const { data } = useApiCostAlerts(activeJobCount);
  const [dismissed, setDismissed] = useState(false);

  if (role !== "admin") return null;
  if (!data?.hasCritical || dismissed) return null;

  const services = data.criticalServices.join(", ");
  const totalToday = data.totalCostTodayUsd.toFixed(2);
  const sinceLabel = data.windowStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground shadow-lg border-b-2 border-destructive-foreground/20 animate-pulse">
      <div className="flex items-center gap-3 px-4 py-2 max-w-full">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="flex-1 min-w-0 text-sm font-bold tracking-wide">
          ⚠️ ABNORMAL API VOLUME — {services} running 3× expected for {activeJobCount} job{activeJobCount === 1 ? "" : "s"} on board · ${totalToday} since {sinceLabel}
        </div>
        <Link to="/admin?section=reports#api-costs">
          <Button
            variant="outline"
            size="sm"
            className="h-7 bg-background/20 border-destructive-foreground/50 text-destructive-foreground hover:bg-background/40 shrink-0"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Review
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDismissed(true)}
          className="h-7 w-7 hover:bg-background/20 text-destructive-foreground shrink-0"
          title="Dismiss for this session"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
