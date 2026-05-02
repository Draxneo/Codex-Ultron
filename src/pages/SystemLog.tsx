import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { ctHeaderLabel } from "@/lib/dateGrouping";
import {
  Activity, AlertTriangle, AlertCircle, RefreshCw, PhoneCall,
  CheckCircle2, Clock, Repeat, Skull, Trash2, ChevronDown, ChevronRight, Route,
  DollarSign, TrendingUp,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useApiUsageObservability } from "@/hooks/useApiUsageObservability";

type Severity = "info" | "warning" | "error" | "critical";

const sevTone: Record<Severity, string> = {
  info: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  warning: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  error: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  critical: "bg-rose-600 text-white border-rose-700",
};

const statusTone: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  succeeded: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  dead_letter: "bg-rose-600 text-white border-rose-700",
  running: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  error: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  timeout: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  waiting_first_run: "bg-sky-500/10 text-sky-700 border-sky-500/30",
  never_run: "bg-slate-500/10 text-slate-700 border-slate-500/30",
};

function SevBadge({ s }: { s: string }) {
  return <Badge variant="outline" className={cn("uppercase text-[10px]", sevTone[(s as Severity)] ?? "")}>{s}</Badge>;
}

function StatusBadge({ s }: { s: string }) {
  return <Badge variant="outline" className={cn("uppercase text-[10px]", statusTone[s] ?? "")}>{s.replace("_", " ")}</Badge>;
}

function Row({ children, expanded, onToggle, hasDetails }: { children: React.ReactNode; expanded?: boolean; onToggle?: () => void; hasDetails?: boolean }) {
  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={onToggle}
        disabled={!hasDetails}
        className={cn(
          "w-full text-left px-3 py-2 text-sm flex items-start gap-2 hover:bg-muted/40 transition-colors",
          !hasDetails && "cursor-default"
        )}
      >
        {hasDetails ? (
          expanded ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        ) : <div className="w-4" />}
        <div className="flex-1 min-w-0">{children}</div>
      </button>
    </div>
  );
}

// ───────────────────────── ERRORS ─────────────────────────
function ErrorsPanel() {
  const [severity, setSeverity] = useState<string>("all");
  const [hideResolved, setHideResolved] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["system_error_log", severity, hideResolved],
    queryFn: async () => {
      let q = supabase.from("system_error_log" as any).select("*").order("occurred_at", { ascending: false }).limit(200);
      if (severity !== "all") q = q.eq("severity", severity);
      if (hideResolved) q = q.is("resolved_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 15_000,
  });

  const resolve = async (id: string) => {
    const { error } = await supabase.from("system_error_log" as any)
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(`Resolve failed: ${error.message}`);
    else { toast.success("Marked resolved"); qc.invalidateQueries({ queryKey: ["system_error_log"] }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant={hideResolved ? "default" : "outline"} onClick={() => setHideResolved(v => !v)} className="h-8">
          {hideResolved ? "Hiding resolved" : "Showing resolved"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-8 ml-auto">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No errors {hideResolved && "(unresolved)"}.
            </div>
          ) : (
            <ScrollArea className="h-[60vh]">
              {rows.map(r => {
                const hasDetails = !!(r.stack_trace || (r.context && Object.keys(r.context).length > 0));
                const isOpen = !!expanded[r.id];
                return (
                  <Row key={r.id} expanded={isOpen} hasDetails={hasDetails} onToggle={() => setExpanded(p => ({ ...p, [r.id]: !p[r.id] }))}>
                    <div className="flex flex-wrap items-center gap-2">
                      <SevBadge s={r.severity} />
                      <span className="font-mono text-xs text-muted-foreground">{r.source_type}</span>
                      <span className="font-medium truncate">{r.source_name}</span>
                      {r.http_status && <Badge variant="outline" className="text-[10px]">HTTP {r.http_status}</Badge>}
                      {r.resolved_at && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Resolved</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.occurred_at), { addSuffix: true })}</span>
                    </div>
                    <div className="text-sm mt-1 break-words">{r.error_message}</div>
                    {isOpen && (
                      <div className="mt-2 space-y-2">
                        {r.context && Object.keys(r.context).length > 0 && (
                          <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto">{JSON.stringify(r.context, null, 2)}</pre>
                        )}
                        {r.stack_trace && (
                          <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap">{r.stack_trace}</pre>
                        )}
                        {!r.resolved_at && (
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); resolve(r.id); }}>
                            Mark resolved
                          </Button>
                        )}
                      </div>
                    )}
                  </Row>
                );
              })}
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────── CRON HEALTH ─────────────────────────
function CronPanel() {
  const { data: health = [], isLoading: loadingHealth, refetch: refetchHealth } = useQuery({
    queryKey: ["cron_health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cron_health" as any);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 30_000,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["cron_job_runs_recent"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_recent_cron_runs" as any, { p_limit: 50 });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => refetchHealth()} className="h-8 ml-auto">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Cron Health</CardTitle>
          <CardDescription>Status of every scheduled job. Daily jobs are judged by their daily window; minute jobs should stay current.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingHealth ? <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            : health.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No cron heartbeats recorded yet.</div>
            : (
              <div>
                {health.map((h: any) => (
                  <div key={h.job_name} className="border-b last:border-b-0 px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs">{h.job_name}</span>
                    <StatusBadge s={h.last_status ?? "unknown"} />
                    {h.is_stale && <Badge variant="outline" className="text-[10px] bg-rose-600 text-white border-rose-700">STALE</Badge>}
                    {h.consecutive_failures > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                        {h.last_status === "success" ? `${h.consecutive_failures} earlier failure${h.consecutive_failures === 1 ? "" : "s"} today` : `${h.consecutive_failures} failure${h.consecutive_failures === 1 ? "" : "s"} today`}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground text-right">
                      {h.last_run_at ? (
                        <>
                          <span className="font-medium text-foreground">{ctHeaderLabel(h.last_run_at)}</span>
                          <span className="mx-1.5 opacity-60">·</span>
                          <span>{formatDistanceToNow(new Date(h.last_run_at), { addSuffix: true })}</span>
                          {h.last_duration_ms != null && (
                            <>
                              <span className="mx-1.5 opacity-60">·</span>
                              <span>{h.last_duration_ms}ms</span>
                            </>
                          )}
                        </>
                      ) : "never run"}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recent Cron Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[40vh]">
            {runs.map((r: any, index: number) => {
              const message = r.return_message ?? r.error_message;
              const rowKey = `${r.job_name}-${r.started_at ?? "unknown"}-${index}`;
              return (
              <div key={rowKey} className="border-b last:border-b-0 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{r.job_name}</span>
                <StatusBadge s={r.status} />
                {typeof r.rows_processed === "number" && (
                  <span className="text-xs text-muted-foreground">{r.rows_processed} rows</span>
                )}
                {r.duration_ms != null && <span className="text-xs text-muted-foreground">{r.duration_ms}ms</span>}
                {message && <span className="text-xs text-rose-600 truncate max-w-[40%]">{message}</span>}
                <span className="ml-auto text-xs text-muted-foreground text-right">
                  <span className="font-medium text-foreground">{ctHeaderLabel(r.started_at)}</span>
                  <span className="mx-1.5 opacity-60">·</span>
                  <span>{format(new Date(r.started_at), "HH:mm:ss")} CT</span>
                </span>
              </div>
              );
            })}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────── RETRY QUEUE ─────────────────────────
function RetryQueuePanel() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["retry_queue", statusFilter],
    queryFn: async () => {
      let q = supabase.from("retry_queue" as any).select("*").order("next_attempt_at", { ascending: true }).limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 15_000,
  });

  const replayNow = async (id: string) => {
    const { error } = await supabase.from("retry_queue" as any)
      .update({ next_attempt_at: new Date().toISOString(), status: "pending" })
      .eq("id", id);
    if (error) toast.error(`Failed: ${error.message}`);
    else { toast.success("Scheduled for next run (within 1 minute)"); qc.invalidateQueries({ queryKey: ["retry_queue"] }); }
  };

  const drop = async (id: string) => {
    const { error } = await supabase.from("retry_queue" as any)
      .update({
        status: "dead_letter",
        dead_lettered_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) toast.error(`Failed: ${error.message}`);
    else { toast.success("Moved to dead-letter"); qc.invalidateQueries({ queryKey: ["retry_queue"] }); }
  };

  const triggerProcessor = async () => {
    const { error } = await supabase.functions.invoke("retry-queue-processor", { body: {} });
    if (error) toast.error(`Processor failed: ${error.message}`);
    else { toast.success("Processor run complete"); qc.invalidateQueries({ queryKey: ["retry_queue"] }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="dead_letter">Dead-lettered</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={triggerProcessor} className="h-8">
          <Repeat className="h-3.5 w-3.5 mr-1.5" /> Run processor now
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            : rows.length === 0 ? <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Queue empty.
              </div>
            : (
              <ScrollArea className="h-[60vh]">
                {rows.map((r: any) => (
                  <div key={r.id} className="border-b last:border-b-0 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-xs">{r.operation_type}</span>
                      <StatusBadge s={r.status} />
                      <Badge variant="outline" className="text-[10px]">attempt {r.attempts}/{r.max_attempts}</Badge>
                      {r.source_function && <span className="text-xs text-muted-foreground">via {r.source_function}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">
                        next: {r.next_attempt_at ? formatDistanceToNow(new Date(r.next_attempt_at), { addSuffix: true }) : "—"}
                      </span>
                    </div>
                    {r.last_error && (
                      <div className="text-xs text-rose-600 mt-1 break-words">{r.last_error}</div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => replayNow(r.id)}>
                        <Repeat className="h-3 w-3 mr-1" /> Replay now
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-rose-600 hover:text-rose-700" onClick={() => drop(r.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Drop
                      </Button>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────── ON-CALL ALERTS ─────────────────────────
function OnCallPanel() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["oncall_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("oncall_alerts" as any)
        .select("*").order("triggered_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 30_000,
  });

  const ack = async (id: string) => {
    const { error } = await supabase.from("oncall_alerts" as any)
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(`Failed: ${error.message}`);
    else { toast.success("Acknowledged"); qc.invalidateQueries({ queryKey: ["oncall_alerts"] }); }
  };

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          : rows.length === 0 ? <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No pages sent.
            </div>
          : (
            <ScrollArea className="h-[60vh]">
              {rows.map((r: any) => (
                <div key={r.id} className="border-b last:border-b-0 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SevBadge s={r.severity} />
                    <span className="font-medium">{r.service}</span>
                    <StatusBadge s={r.notification_status ?? "unknown"} />
                    {r.acknowledged_at && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">ACK</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.triggered_at), { addSuffix: true })}</span>
                  </div>
                  <div className="mt-1">{r.summary}</div>
                  {r.notification_error && <div className="text-xs text-rose-600 mt-1">{r.notification_error}</div>}
                  {!r.acknowledged_at && (
                    <Button size="sm" variant="outline" className="h-7 mt-2" onClick={() => ack(r.id)}>
                      Acknowledge
                    </Button>
                  )}
                </div>
              ))}
            </ScrollArea>
          )}
      </CardContent>
    </Card>
  );
}

function ApiUsagePanel() {
  const { data, isLoading, refetch, isFetching } = useApiUsageObservability();
  const topStatuses = useMemo(() => {
    if (!data?.alerts.statuses) return [];
    const order = { critical: 0, warning: 1, ok: 2 } as const;
    return [...data.alerts.statuses].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [data]);

  const severityTone = (severity: string) => {
    if (severity === "critical") return "bg-rose-600 text-white border-rose-700";
    if (severity === "warning") return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} className="h-8 ml-auto">
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} /> Refresh
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            <div>
              <div className="text-2xl font-bold leading-none">
                {formatCurrency((data?.metrics.todayCostCents ?? 0) / 100)}
              </div>
              <div className="text-xs text-muted-foreground">API cost today</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <div className="text-2xl font-bold leading-none">{data?.metrics.todayCallCount.toLocaleString() ?? 0}</div>
              <div className="text-xs text-muted-foreground">Calls today</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-sm font-medium">{data?.trendSourceLabel ?? "Daily rollups plus recent detail"}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {data?.rollupRowsUsed ?? 0} rollup rows, {data?.recentDetailRowsUsed ?? 0} recent detail rows
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">API Cost Status</CardTitle>
          <CardDescription>Internal daily guardrails use recent detail for same-day runaway alerts; vendor plan limits are separate.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading...</div>
            : topStatuses.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No API usage data yet.</div>
            : (
              <div>
                {topStatuses.map((status) => (
                  <div key={status.limit.service} className="border-b last:border-b-0 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("uppercase text-[10px]", severityTone(status.severity))}>
                      {status.severity}
                    </Badge>
                    <span className="font-medium">{status.limit.label}</span>
                    <span className="text-xs text-muted-foreground">{status.currentCalls.toLocaleString()} calls</span>
                    <span className="ml-auto text-xs tabular-nums">
                      {formatCurrency(status.currentCostUsd)}
                      <span className="text-muted-foreground"> / {formatCurrency(status.limit.dailyCostUsd)} daily guardrail</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Today By Service</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(data?.metrics.byService.length || 0) === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No API calls logged today.</div>
          ) : (
            <div>
              {data!.metrics.byService.map((service) => (
                <div key={service.service} className="border-b last:border-b-0 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{service.service}</span>
                  <span className="text-xs text-muted-foreground">{service.call_count.toLocaleString()} calls</span>
                  {service.tokens_total > 0 && (
                    <span className="text-xs text-muted-foreground">{service.tokens_total.toLocaleString()} tokens</span>
                  )}
                  <span className="ml-auto text-xs tabular-nums font-medium">{formatCurrency(service.total_cost_cents / 100)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(data?.metrics.byFunction.length || 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data!.metrics.byFunction.slice(0, 12).map((fn) => (
            <Badge key={fn.function_name} variant="secondary" className="text-[10px] font-mono">
              {fn.function_name}: {fn.call_count}x ({formatCurrency(fn.total_cost_cents / 100)})
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function TracePanel() {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [callSidFilter, setCallSidFilter] = useState("");
  const [onlyVoice, setOnlyVoice] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["system_trace_events", sourceFilter, kindFilter, callSidFilter, onlyVoice],
    queryFn: async () => {
      let q = supabase
        .from("system_trace_events" as any)
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(250);

      if (onlyVoice) q = q.eq("source_type", "voice");
      if (sourceFilter !== "all") q = q.eq("source_name", sourceFilter);
      if (kindFilter !== "all") q = q.eq("event_kind", kindFilter);
      if (callSidFilter.trim()) q = q.or(`call_sid.eq.${callSidFilter.trim()},trace_group.eq.${callSidFilter.trim()}`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 10_000,
  });

  const sources = useMemo(
    () => Array.from(new Set(rows.map((r) => r.source_name).filter(Boolean))).sort(),
    [rows]
  );
  const kinds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.event_kind).filter(Boolean))).sort(),
    [rows]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={callSidFilter}
          onChange={(e) => setCallSidFilter(e.target.value)}
          placeholder="Filter by CallSid"
          className="h-8 w-[220px]"
        />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="All sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="All events" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {kinds.map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground ml-1">
          <Checkbox checked={onlyVoice} onCheckedChange={(v) => setOnlyVoice(Boolean(v))} />
          Voice only
        </label>
        <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-8 ml-auto">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Heartbeat & Trace</CardTitle>
          <CardDescription>Step-by-step routing and automation decisions, including why each action happened.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            : rows.length === 0 ? <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No trace events yet.
              </div>
            : (
              <ScrollArea className="h-[62vh]">
                {rows.map((r: any) => {
                  const hasDetails = !!(r.reason || r.metadata && Object.keys(r.metadata).length > 0 || r.call_sid || r.parent_call_sid);
                  const isOpen = !!expanded[r.id];
                  return (
                    <Row
                      key={r.id}
                      expanded={isOpen}
                      hasDetails={hasDetails}
                      onToggle={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <SevBadge s={r.severity} />
                        <span className="font-mono text-xs text-muted-foreground">{r.source_name}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">{String(r.event_kind).replace(/_/g, " ")}</Badge>
                        {r.call_sid && <Badge variant="outline" className="text-[10px] font-mono">{r.call_sid}</Badge>}
                        <span className="ml-auto text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.occurred_at), { addSuffix: true })}</span>
                      </div>
                      <div className="text-sm mt-1 break-words">{r.summary}</div>
                      {r.reason && <div className="mt-1 text-xs text-muted-foreground">Why: {r.reason.replace(/_/g, " ")}</div>}
                      {isOpen && (
                        <div className="mt-2 space-y-2">
                          <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                            {r.trace_group && <div><span className="font-medium text-foreground">Trace:</span> <span className="font-mono">{r.trace_group}</span></div>}
                            {r.entity_type && <div><span className="font-medium text-foreground">Entity:</span> {r.entity_type} {r.entity_id ? `(${r.entity_id})` : ""}</div>}
                            {r.parent_call_sid && <div><span className="font-medium text-foreground">Parent call:</span> <span className="font-mono">{r.parent_call_sid}</span></div>}
                            <div><span className="font-medium text-foreground">At:</span> {ctHeaderLabel(r.occurred_at)} · {format(new Date(r.occurred_at), "HH:mm:ss")} CT</div>
                          </div>
                          {r.metadata && Object.keys(r.metadata).length > 0 && (
                            <pre className="text-[11px] bg-muted/50 rounded p-2 overflow-x-auto">{JSON.stringify(r.metadata, null, 2)}</pre>
                          )}
                        </div>
                      )}
                    </Row>
                  );
                })}
              </ScrollArea>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────── SUMMARY HEADER ─────────────────────────
function SummaryStrip() {
  const { data: stats } = useQuery({
    queryKey: ["system_log_summary"],
    queryFn: async () => {
      const [errs, retries, alerts, cron, trace] = await Promise.all([
        supabase.from("system_error_log" as any).select("id", { count: "exact", head: true }).is("resolved_at", null).in("severity", ["error", "critical"]),
        supabase.from("retry_queue" as any).select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("oncall_alerts" as any).select("id", { count: "exact", head: true }).is("acknowledged_at", null).gte("triggered_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
        supabase.rpc("get_cron_health" as any),
        supabase.from("system_trace_events" as any).select("id", { count: "exact", head: true }).gte("occurred_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
      ]);
      const stale = ((cron.data as any[]) ?? []).filter(c => c.is_stale).length;
      return {
        errors: errs.count ?? 0,
        retries: retries.count ?? 0,
        alerts: alerts.count ?? 0,
        stale,
        trace: trace.count ?? 0,
      };
    },
    refetchInterval: 15_000,
  });

  const items = [
    { label: "Open errors", value: stats?.errors ?? 0, icon: AlertCircle, tone: (stats?.errors ?? 0) > 0 ? "text-rose-600" : "text-emerald-600" },
    { label: "Pending retries", value: stats?.retries ?? 0, icon: Repeat, tone: (stats?.retries ?? 0) > 0 ? "text-amber-600" : "text-emerald-600" },
    { label: "Unacked pages (24h)", value: stats?.alerts ?? 0, icon: PhoneCall, tone: (stats?.alerts ?? 0) > 0 ? "text-rose-600" : "text-emerald-600" },
    { label: "Stale crons", value: stats?.stale ?? 0, icon: Clock, tone: (stats?.stale ?? 0) > 0 ? "text-rose-600" : "text-emerald-600" },
    { label: "Trace events (1h)", value: stats?.trace ?? 0, icon: Route, tone: (stats?.trace ?? 0) > 0 ? "text-primary" : "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {items.map(it => (
        <Card key={it.label}>
          <CardContent className="p-3 flex items-center gap-3">
            <it.icon className={cn("h-5 w-5", it.tone)} />
            <div>
              <div className={cn("text-2xl font-bold leading-none", it.tone)}>{it.value}</div>
              <div className="text-xs text-muted-foreground">{it.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ───────────────────────── PAGE ─────────────────────────
export default function SystemLog() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto max-w-6xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">System Log</h1>
          <Badge variant="outline" className="text-[10px] uppercase">Mission Control</Badge>
        </div>

        <SummaryStrip />

        <Tabs defaultValue="errors" className="space-y-3">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="errors" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Errors</TabsTrigger>
            <TabsTrigger value="trace" className="gap-1.5"><Route className="h-3.5 w-3.5" /> Trace</TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" /> API Usage</TabsTrigger>
            <TabsTrigger value="cron" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Cron</TabsTrigger>
            <TabsTrigger value="retries" className="gap-1.5"><Repeat className="h-3.5 w-3.5" /> Retry Queue</TabsTrigger>
            <TabsTrigger value="oncall" className="gap-1.5"><PhoneCall className="h-3.5 w-3.5" /> On-Call</TabsTrigger>
          </TabsList>
          <TabsContent value="errors"><ErrorsPanel /></TabsContent>
          <TabsContent value="trace"><TracePanel /></TabsContent>
          <TabsContent value="api"><ApiUsagePanel /></TabsContent>
          <TabsContent value="cron"><CronPanel /></TabsContent>
          <TabsContent value="retries"><RetryQueuePanel /></TabsContent>
          <TabsContent value="oncall"><OnCallPanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
