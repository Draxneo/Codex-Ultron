import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BellOff, ExternalLink } from "lucide-react";
import { useApiCostAlerts } from "@/hooks/useApiCostAlerts";
import { useActiveJobCount } from "@/hooks/useActiveJobCount";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const SNOOZE_STORAGE_KEY = "api_cost_alert_snooze_v1";
const SNOOZE_MS = 2 * 60 * 60 * 1000;

type SnoozeState = {
  day: string;
  servicesKey: string;
  mutedUntil: number;
  baselineCalls: number;
  baselineCostUsd: number;
};

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function readSnooze(): SnoozeState | null {
  try {
    const raw = window.localStorage.getItem(SNOOZE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SnoozeState) : null;
  } catch {
    return null;
  }
}

function writeSnooze(state: SnoozeState) {
  try {
    window.localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-critical: if localStorage is unavailable, the banner simply won't persist snooze.
  }
}

/**
 * Global red banner shown above the AppHeader when API volume trips an internal
 * runaway guardrail. Admins can snooze it, but it reappears if the same pattern
 * keeps climbing or if a different service joins the critical list.
 */
export function ApiCostAlertBanner() {
  const { role } = useAuth();
  const { data: activeJobCount = 0 } = useActiveJobCount();
  const { data } = useApiCostAlerts(activeJobCount);
  const [snooze, setSnooze] = useState<SnoozeState | null>(() => readSnooze());

  const criticalSnapshot = useMemo(() => {
    const critical = data?.statuses.filter((status) => status.severity === "critical") || [];
    return {
      servicesKey: critical.map((status) => status.limit.service).sort().join("|"),
      calls: critical.reduce((sum, status) => sum + status.currentCalls, 0),
      costUsd: critical.reduce((sum, status) => sum + status.currentCostUsd, 0),
    };
  }, [data?.statuses]);

  if (role !== "admin") return null;
  if (!data?.hasCritical) return null;

  const now = Date.now();
  const currentDay = todayKey();
  const sameSnooze =
    snooze?.day === currentDay &&
    snooze.servicesKey === criticalSnapshot.servicesKey &&
    snooze.mutedUntil > now;
  const enoughNewUsage =
    snooze
      ? criticalSnapshot.calls >= snooze.baselineCalls + Math.max(10, Math.ceil(snooze.baselineCalls * 0.25)) ||
        criticalSnapshot.costUsd >= snooze.baselineCostUsd + 1
      : false;

  if (sameSnooze && !enoughNewUsage) return null;

  const services = data.criticalServices.join(", ");
  const totalToday = data.totalCostTodayUsd.toFixed(2);
  const sinceLabel = data.windowStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const handleSnooze = () => {
    const next = {
      day: currentDay,
      servicesKey: criticalSnapshot.servicesKey,
      mutedUntil: Date.now() + SNOOZE_MS,
      baselineCalls: criticalSnapshot.calls,
      baselineCostUsd: criticalSnapshot.costUsd,
    };
    writeSnooze(next);
    setSnooze(next);
  };

  return (
    <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground shadow-lg border-b-2 border-destructive-foreground/20">
      <div className="flex items-center gap-3 px-4 py-2 max-w-full">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="flex-1 min-w-0 text-sm font-bold tracking-wide">
          ABNORMAL API VOLUME - {services} running 3x expected for {activeJobCount} jobs/estimates on board - ${totalToday} since {sinceLabel}
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
          size="sm"
          onClick={handleSnooze}
          className="h-7 hover:bg-background/20 text-destructive-foreground shrink-0"
          title="Silence for 2 hours. It will come back sooner if usage keeps climbing."
        >
          <BellOff className="h-3 w-3 mr-1" />
          Snooze 2h
        </Button>
      </div>
    </div>
  );
}
