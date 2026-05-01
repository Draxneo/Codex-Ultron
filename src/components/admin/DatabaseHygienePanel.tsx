import { useQuery } from "@tanstack/react-query";
import { Archive, CheckCircle2, Clock3, Database, HardDrive, RefreshCw, Table2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type HygieneReport = {
  generated_at?: string;
  table_count?: number;
  total_bytes?: number;
  top_tables?: HygieneTable[];
  cleanup_candidates?: CleanupCandidate[];
  policies?: RetentionPolicy[];
  last_runs?: CleanupRun[];
};

type HygieneTable = {
  table_name: string;
  estimated_rows: number;
  total_bytes: number;
  category?: string | null;
  retention_action?: string | null;
  retention_days?: number | null;
  policy_enabled?: boolean;
  business_use?: string | null;
};

type CleanupCandidate = {
  key: string;
  label: string;
  table_name: string;
  action: string;
  count: number;
  helper: string;
};

type RetentionPolicy = {
  table_name: string;
  category: string;
  business_use: string;
  retention_action: string;
  retention_days: number | null;
  enabled: boolean;
  notes?: string | null;
};

type CleanupRun = {
  id: string;
  started_at: string;
  finished_at?: string | null;
  dry_run: boolean;
  status: string;
  result?: Record<string, unknown>;
  error_message?: string | null;
  triggered_by?: string | null;
};

function formatBytes(bytes?: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function actionLabel(action?: string | null) {
  if (action === "archive_delete") return "archive, then clear";
  if (action === "rollup_delete") return "summarize, then clear";
  if (action === "delete") return "clear automatically";
  if (action === "normalize") return "fix old labels";
  if (action === "keep") return "keep";
  return "review first";
}

function toneForAction(action?: string | null) {
  if (action === "keep") return "outline" as const;
  if (action === "review") return "secondary" as const;
  return "default" as const;
}

export function DatabaseHygienePanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["database-hygiene-report"],
    queryFn: async () => {
      const { data: report, error } = await (supabase as any).rpc("get_database_hygiene_report");
      if (error) throw error;
      return (report ?? {}) as HygieneReport;
    },
    refetchInterval: 60_000,
  });

  const cleanupCandidates = data?.cleanup_candidates ?? [];
  const cleanupCount = cleanupCandidates.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const topTables = data?.top_tables ?? [];
  const policies = data?.policies ?? [];
  const lastRun = data?.last_runs?.[0];

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" /> Database Hygiene
            </CardTitle>
            <CardDescription>
              A visual look at what is permanent, what expires, and what the cleanup job is watching.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-4 w-4" /> Database size
            </div>
            <p className="mt-2 text-2xl font-bold">{formatBytes(data?.total_bytes)}</p>
            <p className="text-sm text-muted-foreground">{data?.table_count ?? 0} tables being tracked</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Trash2 className="h-4 w-4" /> Ready for cleanup
            </div>
            <p className="mt-2 text-2xl font-bold">{cleanupCount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">rows in approved cleanup buckets</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock3 className="h-4 w-4" /> Last cleanup
            </div>
            <p className="mt-2 text-lg font-bold">{lastRun ? new Date(lastRun.started_at).toLocaleString() : "No run yet"}</p>
            <p className="text-sm text-muted-foreground">{lastRun ? `${lastRun.status}${lastRun.dry_run ? " dry run" : ""}` : "Daily job is ready"}</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">Cleanup Buckets</h3>
              <p className="text-sm text-muted-foreground">Stuff that is allowed to expire because it is queue noise, not customer history.</p>
            </div>
            <div className="divide-y">
              {cleanupCandidates.map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.label}</p>
                      <Badge variant="outline">{item.table_name}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.helper}</p>
                    <p className="mt-1 text-xs font-medium text-primary">{item.action}</p>
                  </div>
                  <Badge variant={item.count > 0 ? "secondary" : "outline"} className="shrink-0">
                    {Number(item.count || 0).toLocaleString()}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">Largest Tables</h3>
              <p className="text-sm text-muted-foreground">The biggest boxes in the back room, labeled in plain English.</p>
            </div>
            <div className="max-h-[480px] divide-y overflow-auto">
              {topTables.map((table) => (
                <div key={table.table_name} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Table2 className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{table.table_name}</p>
                      <Badge variant={toneForAction(table.retention_action)}>{actionLabel(table.retention_action)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{table.business_use || table.category || "Needs a label"}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="font-semibold">{formatBytes(table.total_bytes)}</p>
                    <p className="text-xs text-muted-foreground">~{Number(table.estimated_rows || 0).toLocaleString()} rows</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Retention Rules</h3>
            <p className="text-sm text-muted-foreground">The current house rules for what stays forever and what cleans itself up.</p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {policies.map((policy) => (
              <div key={policy.table_name} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{policy.table_name}</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{policy.category}</p>
                  </div>
                  {policy.enabled ? (
                    <Badge variant="outline" className="gap-1 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> on
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Archive className="h-3 w-3" /> review
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{policy.business_use}</p>
                <p className="mt-2 text-sm font-medium">
                  {actionLabel(policy.retention_action)}
                  {policy.retention_days ? ` after ${policy.retention_days} days` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
