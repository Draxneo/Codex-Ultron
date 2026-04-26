import { RefreshCw, DollarSign, AlertTriangle, TrendingUp, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApiUsageMetrics } from "@/hooks/useApiUsageMetrics";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const SERVICE_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  twilio_sms: "Twilio SMS",
  twilio_voice: "Twilio Voice",
  deepgram: "Deepgram",
  lovable_ai: "Lovable AI",
  sendgrid: "SendGrid",
  firecrawl: "Firecrawl",
};

// Runaway-detection thresholds (per day). Set high enough to ignore normal
// busy-day volume — we only want to flag clearly abnormal spikes that
// suggest buggy code looping or fanning out API calls.
const DEFAULT_ALERT_CENTS = 2000; // $20/day
const COST_ALERT_CENTS: Record<string, number> = {
  google_maps: 2000,    // $20/day
  lovable_ai: 2000,     // $20/day
  twilio_sms: 2000,     // $20/day — high SMS volume is normal
  deepgram: 2000,       // $20/day
  firecrawl: 2000,      // $20/day
  sendgrid: 2000,       // $20/day
  twilio_voice: 2000,   // $20/day
};

export function ApiCostTrackerCard() {
  const { data, isLoading, refetch, isFetching } = useApiUsageMetrics();

  const todayCost = data?.todayCostCents ? (data.todayCostCents / 100).toFixed(2) : "0.00";
  const alerts = (data?.byService || []).filter(
    s => s.total_cost_cents > (COST_ALERT_CENTS[s.service] ?? DEFAULT_ALERT_CENTS)
  );

  // Build 7-day chart data
  const chartData = (() => {
    if (!data?.dailyTrend?.length) return [];
    const dayMap = new Map<string, { day: string; cost: number; calls: number }>();
    for (const t of data.dailyTrend) {
      const existing = dayMap.get(t.day) || { day: t.day, cost: 0, calls: 0 };
      existing.cost += t.total_cost_cents / 100;
      existing.calls += t.call_count;
      dayMap.set(t.day, existing);
    }
    return Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day));
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            API Cost Tracker
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Today's snapshot */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Today's Cost</p>
              <p className="text-lg font-bold">${todayCost}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">API Calls</p>
              <p className="text-lg font-bold">{data?.todayCallCount || 0}</p>
            </div>
          </div>
          {alerts.length > 0 && (
            <div className="flex items-center gap-2 bg-destructive/10 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-xs text-destructive font-medium">{alerts.length} Alert{alerts.length > 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">{alerts.map(a => SERVICE_LABELS[a.service] || a.service).join(", ")}</p>
              </div>
            </div>
          )}
        </div>

        {/* By Service table */}
        {(data?.byService?.length || 0) > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">By Service (Today)</p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-left px-3 py-1.5 font-medium">Service</th>
                    <th className="text-right px-3 py-1.5 font-medium">Calls</th>
                    <th className="text-right px-3 py-1.5 font-medium">Tokens</th>
                    <th className="text-right px-3 py-1.5 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.byService.map(s => {
                    const isAlert = s.total_cost_cents > (COST_ALERT_CENTS[s.service] ?? DEFAULT_ALERT_CENTS);
                    return (
                      <tr key={s.service} className={isAlert ? "bg-destructive/5" : ""}>
                        <td className="px-3 py-1.5 flex items-center gap-1.5">
                          {SERVICE_LABELS[s.service] || s.service}
                          {isAlert && <Badge variant="destructive" className="text-[10px] px-1 py-0">!</Badge>}
                        </td>
                        <td className="text-right px-3 py-1.5 tabular-nums">{s.call_count}</td>
                        <td className="text-right px-3 py-1.5 tabular-nums text-muted-foreground">
                          {s.tokens_total > 0 ? s.tokens_total.toLocaleString() : "—"}
                        </td>
                        <td className="text-right px-3 py-1.5 tabular-nums font-medium">
                          ${(s.total_cost_cents / 100).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : !isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-4">No API calls logged today yet.</p>
        ) : null}

        {/* Top Functions */}
        {(data?.byFunction?.length || 0) > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Top Functions (Today)</p>
            <div className="flex flex-wrap gap-1.5">
              {data!.byFunction.slice(0, 8).map(f => (
                <Badge key={f.function_name} variant="secondary" className="text-[10px] font-mono">
                  {f.function_name}: {f.call_count}× (${(f.total_cost_cents / 100).toFixed(2)})
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 7-day trend chart */}
        {chartData.length > 1 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">7-Day Cost Trend</p>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} width={40} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
                    labelFormatter={l => l}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {isLoading && <p className="text-xs text-muted-foreground text-center py-4">Loading metrics...</p>}
      </CardContent>
    </Card>
  );
}
