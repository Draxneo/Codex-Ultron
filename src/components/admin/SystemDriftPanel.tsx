import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, Clock3, Database, GitBranch, RefreshCw, ShieldCheck, Table2, Workflow, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DriftSummary = {
  public_tables?: number;
  labeled_tables?: number;
  unlabeled_tables?: number;
  public_functions?: number;
  public_triggers?: number;
  cron_jobs?: number;
  jarvis_named_functions?: number;
  jarvis_named_tables?: number;
};

type TableCategory = {
  inferred_category: string;
  table_count: number;
  unlabeled_count: number;
  estimated_rows: number;
  total_size: string;
};

type FunctionCategory = {
  inferred_category: string;
  function_count: number;
};

type UnlabeledTable = {
  table_name: string;
  inferred_category: string;
  estimated_rows: number;
  total_bytes: number;
};

type CronJob = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  command: string;
};

type Guardrail = {
  title: string;
  helper: string;
};

type SystemDriftReport = {
  generated_at?: string;
  summary?: DriftSummary;
  table_categories?: TableCategory[];
  function_categories?: FunctionCategory[];
  unlabeled_tables?: UnlabeledTable[];
  cron_jobs?: CronJob[];
  guardrails?: Guardrail[];
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

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  helper: string;
  tone?: "default" | "warning" | "good";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-500/30 bg-amber-500/10"
      : tone === "good"
        ? "border-emerald-500/30 bg-emerald-500/10"
        : "bg-card";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{Number(value || 0).toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

export function SystemDriftPanel() {
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["system-drift-report"],
    queryFn: async () => {
      const { data: report, error } = await (supabase as any).rpc("get_system_drift_report");
      if (error) throw error;
      return (report ?? {}) as SystemDriftReport;
    },
    refetchInterval: 60_000,
  });

  const summary = data?.summary ?? {};
  const unlabeledTables = data?.unlabeled_tables ?? [];
  const tableCategories = data?.table_categories ?? [];
  const functionCategories = data?.function_categories ?? [];
  const cronJobs = data?.cron_jobs ?? [];
  const guardrails = data?.guardrails ?? [];
  const labelProgress =
    summary.public_tables && summary.public_tables > 0
      ? Math.round(((summary.labeled_tables ?? 0) / summary.public_tables) * 100)
      : 0;

  return (
    <Card className="overflow-hidden border-amber-500/20">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4 text-amber-500" /> System Drift Watch
            </CardTitle>
            <CardDescription>
              A plain-English inventory for spotting old tables, old helpers, and unlabeled back-end pieces before they confuse the current app.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
            Drift report needs wiring: {(error as Error).message}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Table2} label="Tables" value={summary.public_tables ?? 0} helper={`${labelProgress}% have an owner/use label`} tone={labelProgress >= 80 ? "good" : "warning"} />
          <StatCard icon={AlertTriangle} label="Unlabeled tables" value={summary.unlabeled_tables ?? 0} helper="Need owner, purpose, and retention rule" tone={(summary.unlabeled_tables ?? 0) > 0 ? "warning" : "good"} />
          <StatCard icon={Wrench} label="Database helpers" value={summary.public_functions ?? 0} helper="RPCs, triggers helpers, and internal utilities" />
          <StatCard icon={Bot} label="Jarvis-named pieces" value={(summary.jarvis_named_functions ?? 0) + (summary.jarvis_named_tables ?? 0)} helper="Jarvis tools, knowledge, and AI database surface" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">Database Areas</h3>
              <p className="text-sm text-muted-foreground">The table pile broken into plain-English buckets.</p>
            </div>
            <div className="divide-y">
              {tableCategories.map((category) => (
                <div key={category.inferred_category} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{category.inferred_category}</p>
                      {category.unlabeled_count > 0 && <Badge variant="secondary">{category.unlabeled_count} need labels</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {Number(category.table_count || 0).toLocaleString()} tables, about {Number(category.estimated_rows || 0).toLocaleString()} rows
                    </p>
                  </div>
                  <Badge variant="outline">{category.total_size}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border">
              <div className="border-b px-4 py-3">
                <h3 className="font-semibold">Back-End Automation</h3>
                <p className="text-sm text-muted-foreground">Helpers that can change data without someone clicking around.</p>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Workflow className="h-4 w-4" /> Triggers
                  </div>
                  <p className="mt-2 text-2xl font-bold">{Number(summary.public_triggers || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock3 className="h-4 w-4" /> Scheduled jobs
                  </div>
                  <p className="mt-2 text-2xl font-bold">{Number(summary.cron_jobs || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="divide-y border-t">
                {functionCategories.map((category) => (
                  <div key={category.inferred_category} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span>{category.inferred_category}</span>
                    <Badge variant="outline">{category.function_count}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="border-b px-4 py-3">
                <h3 className="font-semibold">Guardrails</h3>
                <p className="text-sm text-muted-foreground">Rules to keep the current system from drifting.</p>
              </div>
              <div className="space-y-2 p-4">
                {guardrails.map((guardrail) => (
                  <div key={guardrail.title} className="rounded-lg border bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      {guardrail.title}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{guardrail.helper}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Biggest Unlabeled Tables</h3>
            <p className="text-sm text-muted-foreground">
              These are not necessarily bad. They just need a business owner, purpose, and retention rule before we trust them.
            </p>
          </div>
          <div className="max-h-[360px] divide-y overflow-auto">
            {unlabeledTables.map((table) => (
              <div key={table.table_name} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{table.table_name}</p>
                    <Badge variant="outline">{table.inferred_category}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">About {Number(table.estimated_rows || 0).toLocaleString()} rows</p>
                </div>
                <Badge variant="secondary">{formatBytes(table.total_bytes)}</Badge>
              </div>
            ))}
          </div>
        </div>

        {cronJobs.length > 0 && (
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">Scheduled Jobs</h3>
              <p className="text-sm text-muted-foreground">Anything running on a timer should be visible here.</p>
            </div>
            <div className="divide-y">
              {cronJobs.map((job) => (
                <div key={job.jobid} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{job.jobname || `Job ${job.jobid}`}</p>
                      <Badge variant={job.active ? "outline" : "secondary"}>{job.active ? "active" : "paused"}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{job.command}</p>
                  </div>
                  <Badge variant="outline">{job.schedule}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
