import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, AlertCircle, TrendingUp, DollarSign, RefreshCw, Info, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useApiCostAlerts } from "@/hooks/useApiCostAlerts";
import { useActiveJobCount } from "@/hooks/useActiveJobCount";
import { getExpectedCeiling } from "@/config/apiCostLimits";
import { useQueryClient } from "@tanstack/react-query";

const severityStyles = {
  ok: { color: "text-emerald-600", bg: "bg-emerald-500/10", icon: CheckCircle2, label: "OK" },
  warning: { color: "text-amber-600", bg: "bg-amber-500/10", icon: AlertCircle, label: "WARNING" },
  critical: { color: "text-destructive", bg: "bg-destructive/10", icon: AlertTriangle, label: "OVER LIMIT" },
} as const;

/**
 * Comprehensive admin card listing every monitored API service:
 * - daily limit (cost + call volume)
 * - actual usage today
 * - projected end-of-day cost (extrapolated from elapsed hours)
 * - status badge (OK / WARNING / OVER LIMIT)
 * - per-service cost-per-call reference & expected volume
 */
export function ApiCostsOverviewCard() {
  const { data: activeJobCount = 0 } = useActiveJobCount();
  const { data, isLoading, refetch, isFetching } = useApiCostAlerts(activeJobCount);
  const qc = useQueryClient();

  const sortedStatuses = useMemo(() => {
    if (!data?.statuses) return [];
    const order = { critical: 0, warning: 1, ok: 2 } as const;
    return [...data.statuses].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [data]);

  const handleRefresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["api-usage-metrics"] });
  };

  return (
    <TooltipProvider>
      <Card id="api-costs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                API Cost Overview & Limits
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <span>All figures are <span className="font-semibold text-foreground">per day</span> (resets at midnight Central).</span>
                <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-5">
                  <Briefcase className="h-2.5 w-2.5" />
                  {activeJobCount} jobs/estimates on board
                </Badge>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {data && (
                <div className="flex items-center gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Today so far: </span>
                    <span className="font-bold tabular-nums">${data.totalCostTodayUsd.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Projected end-of-day: </span>
                    <span className="font-bold tabular-nums">${data.projectedTotalDailyUsd.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isFetching} className="h-7 px-2 text-xs">
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Critical alert summary at top */}
          {data?.hasCritical && (
            <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-3 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="text-sm">
                <p className="font-bold text-destructive">⚠️ {data.criticalServices.length} service{data.criticalServices.length > 1 ? "s" : ""} over daily limit</p>
                <p className="text-xs text-muted-foreground">
                  Investigate immediately: <span className="font-medium">{data.criticalServices.join(", ")}</span>
                </p>
              </div>
            </div>
          )}

          {/* Service rows */}
          <div className="space-y-2">
            {sortedStatuses.map(({ limit, currentCostUsd, currentCalls, percentOfCostLimit, percentOfCallLimit, severity, projectedDailyCostUsd }) => {
              const style = severityStyles[severity];
              const Icon = style.icon;
              const dominantPct = Math.max(percentOfCostLimit, percentOfCallLimit);
              const cappedPct = Math.min(100, dominantPct);
              const expectedCeiling = getExpectedCeiling(limit, activeJobCount);
              const overExpected = expectedCeiling != null && currentCalls > expectedCeiling;

              return (
                <div key={limit.service} className={`rounded-lg border p-3 ${style.bg}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{limit.label}</span>
                          <Badge variant={severity === "critical" ? "destructive" : severity === "warning" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0 h-4">
                            {style.label}
                          </Badge>
                          {overExpected && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                              {(currentCalls / Math.max(1, expectedCeiling!)).toFixed(1)}× expected
                            </Badge>
                          )}
                          {limit.notes && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">{limit.notes}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Expected: {limit.expectedDailyCalls}
                          {limit.costPerCall && <> · {limit.costPerCall}</>}
                        </p>
                        {expectedCeiling != null && (
                          <p className={`text-[11px] mt-0.5 ${overExpected ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            Should be ≤ <span className="font-semibold">{expectedCeiling}</span> calls today
                            <span className="text-muted-foreground/70">
                              {" "}({limit.baselineCalls || 0} baseline + {activeJobCount} jobs/estimates x {limit.expectedCallsPerJob})
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${style.color}`}>
                        ${currentCostUsd.toFixed(2)} <span className="text-xs text-muted-foreground font-normal">/ ${limit.dailyCostUsd.toFixed(2)} per day</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {currentCalls.toLocaleString()} / {limit.dailyCalls.toLocaleString()} calls today
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Progress
                      value={cappedPct}
                      className={`h-1.5 ${severity === "critical" ? "[&>div]:bg-destructive" : severity === "warning" ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
                    />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{dominantPct.toFixed(0)}% of limit reached</span>
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-2.5 w-2.5" />
                        Projected today: <span className="font-semibold text-foreground tabular-nums">${projectedDailyCostUsd.toFixed(2)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">Loading cost data...</p>
          )}

          <p className="text-[10px] text-muted-foreground text-center pt-2 border-t">
            Limits are based on healthy operational baselines. Edit them in <code className="bg-muted px-1 rounded">src/config/apiCostLimits.ts</code>.
          </p>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
