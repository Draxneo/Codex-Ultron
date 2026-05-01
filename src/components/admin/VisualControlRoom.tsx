import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  GitBranch,
  Link2Off,
  MessageSquareWarning,
  PhoneCall,
  RefreshCw,
  Route,
  ShieldAlert,
  Sparkles,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseHygienePanel } from "@/components/admin/DatabaseHygienePanel";
import { SystemDriftPanel } from "@/components/admin/SystemDriftPanel";

type CountResult = {
  key: string;
  title: string;
  helper: string;
  count: number;
  error?: string | null;
  tone: "good" | "watch" | "danger" | "quiet";
  icon: React.ElementType;
};

const CURRENT_LOOKBACK_DAYS = 7;
const DISPATCH_LOOKBACK_DAYS = 14;

const recentCutoff = () => new Date(Date.now() - CURRENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
const dispatchCutoff = () => new Date(Date.now() - DISPATCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
const todayDate = () => new Date().toISOString().slice(0, 10);

async function countRows(
  key: string,
  title: string,
  helper: string,
  table: string,
  icon: React.ElementType,
  tone: CountResult["tone"],
  build?: (query: any) => any
): Promise<CountResult> {
  try {
    let query = supabase.from(table as any).select("id", { count: "exact", head: true });
    if (build) query = build(query);
    const { count, error } = await query;
    return { key, title, helper, count: count ?? 0, error: error?.message ?? null, tone, icon };
  } catch (error: any) {
    return { key, title, helper, count: 0, error: error?.message ?? "Could not read this check.", tone, icon };
  }
}

async function fetchRecentErrors() {
  try {
    const { data, error } = await supabase
      .from("system_error_log" as any)
      .select("id, severity, source_name, message, occurred_at")
      .is("resolved_at", null)
      .order("occurred_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    return data ?? [];
  } catch {
    return [];
  }
}

function toneClasses(tone: CountResult["tone"]) {
  if (tone === "danger") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (tone === "watch") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (tone === "good") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return "border-border bg-muted/30 text-muted-foreground";
}

function WatchCard({ item }: { item: CountResult }) {
  const Icon = item.icon;
  const isClear = item.count === 0 && !item.error;

  return (
    <div className={`rounded-lg border p-4 ${toneClasses(isClear ? "good" : item.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-background/70 p-2">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-sm leading-snug opacity-80">{item.helper}</p>
            {item.error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">Needs wiring check: {item.error}</p>}
          </div>
        </div>
        <Badge variant={isClear ? "outline" : "secondary"} className="shrink-0 text-base font-bold">
          {item.error ? "?" : item.count.toLocaleString()}
        </Badge>
      </div>
    </div>
  );
}

function JourneyStep({
  title,
  helper,
  icon: Icon,
  count,
}: {
  title: string;
  helper: string;
  icon: React.ElementType;
  count: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{helper}</p>
          </div>
        </div>
        <Badge variant={count > 0 ? "secondary" : "outline"}>{count}</Badge>
      </div>
    </div>
  );
}

export function VisualControlRoom() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["visual-control-room"],
    queryFn: async () => {
      const [
        workflowAlerts,
        hiddenCards,
        ownerQuestions,
        systemErrors,
        failedSms,
        outboundDrafts,
        dispatchGaps,
        hcpResidue,
        routeQueue,
        apiLogs,
        dailyRollups,
      ] = await Promise.all([
        countRows(
          "workflow-alerts",
          "Cards waiting on a person",
          `Cards from the last ${CURRENT_LOOKBACK_DAYS} days that Jarvis could not safely move forward by itself.`,
          "workflow_alerts",
          ShieldAlert,
          "danger",
          (q) =>
            q
              .not("status", "in", '("resolved","closed","complete","completed","dismissed")')
              .gte("created_at", recentCutoff())
        ),
        countRows(
          "hidden-cards",
          "Cards hidden from NOW",
          "Things someone acknowledged or snoozed so they would leave the main board.",
          "workflow_card_acknowledgements",
          Eye,
          "watch",
          (q) => q.gt("expires_at", new Date().toISOString())
        ),
        countRows(
          "owner-questions",
          "Owner answers waiting",
          "Questions sent out for approval that still need a reply.",
          "owner_input_requests",
          UserRoundCheck,
          "watch",
          (q) => q.eq("status", "pending")
        ),
        countRows(
          "system-errors",
          "Open system errors",
          "Backend problems that have not been marked fixed.",
          "system_error_log",
          AlertTriangle,
          "danger",
          (q) => q.is("resolved_at", null)
        ),
        countRows(
          "failed-sms",
          "Text messages in trouble",
          `Failed or undelivered texts from the last ${CURRENT_LOOKBACK_DAYS} days.`,
          "sms_log",
          MessageSquareWarning,
          "danger",
          (q) => q.in("delivery_status", ["failed", "undelivered"]).gte("created_at", recentCutoff())
        ),
        countRows(
          "outbound-drafts",
          "Draft texts not sent",
          `Real draft texts from the last ${CURRENT_LOOKBACK_DAYS} days that still need approval or cleanup.`,
          "outbound_drafts",
          MessageSquareWarning,
          "watch",
          (q) =>
            q
              .in("status", ["pending", "auto_pending", "queued_retry", "failed"])
              .gte("created_at", recentCutoff())
              .not("body", "eq", "")
        ),
        countRows(
          "dispatch-gaps",
          "Current jobs missing basics",
          "Recent or upcoming jobs missing a date, assigned tech, or usable address.",
          "jobs",
          Truck,
          "watch",
          (q) =>
            q
              .not("status", "in", '("completed","complete","canceled","cancelled","archived","invoiced","done","paid","closed")')
              .or("scheduled_date.is.null,assigned_to.is.null,address.is.null")
              .or(`created_at.gte.${dispatchCutoff()},scheduled_date.gte.${todayDate()}`)
        ),
        countRows(
          "hcp-residue",
          "Import attachment review",
          "Housecall Pro attachment records that need review before we call the import finished.",
          "hcp_attachments",
          Database,
          "quiet",
          (q) => q.in("archive_status", ["failed", "metadata", "missing"])
        ),
        countRows(
          "route-queue",
          "Route messages waiting",
          "ETA or route messages sitting in a queue.",
          "route_sms_queue",
          Route,
          "watch",
          (q) => q.not("status", "in", '("sent","closed","dismissed")')
        ),
        countRows(
          "api-logs",
          "API usage rows",
          "Raw API usage being recorded for cost tracking.",
          "api_usage_log",
          Sparkles,
          "quiet"
        ),
        countRows(
          "daily-rollups",
          "Daily cost summaries",
          "The daily usage summary table should be filling up over time.",
          "api_usage_daily_rollups",
          Sparkles,
          "quiet"
        ),
      ]);

      const recentErrors = await fetchRecentErrors();

      return {
        checks: [
          workflowAlerts,
          hiddenCards,
          ownerQuestions,
          systemErrors,
          failedSms,
          outboundDrafts,
          dispatchGaps,
          hcpResidue,
          routeQueue,
          apiLogs,
          dailyRollups,
        ],
        recentErrors,
      };
    },
    refetchInterval: 60_000,
  });

  const checks = useMemo(() => data?.checks ?? [], [data?.checks]);
  const troubleCount = useMemo(
    () =>
      checks.filter((item) => !item.error && item.tone !== "quiet" && item.count > 0).reduce((sum, item) => sum + item.count, 0),
    [checks]
  );
  const wiringCount = checks.filter((item) => item.error).length;
  const dailyRollups = checks.find((item) => item.key === "daily-rollups")?.count ?? 0;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="bg-primary text-primary-foreground">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5" /> Admin Control Room
              </CardTitle>
              <CardDescription className="text-primary-foreground/80">
                Tucked-away checks for things that could fall through the cracks.
              </CardDescription>
            </div>
            <Button variant="secondary" size="sm" className="gap-2" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-3xl font-bold">{troubleCount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">items that need a quick look</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-3xl font-bold">{wiringCount}</p>
            <p className="text-sm text-muted-foreground">checks that need wiring</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-3xl font-bold">{dailyRollups.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">daily cost summaries saved</p>
          </div>
        </CardContent>
      </Card>

      <DatabaseHygienePanel />

      <SystemDriftPanel />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-primary" /> Customer Journey Safety Map
          </CardTitle>
          <CardDescription>
            A visual way to check the chain from first contact to closeout without cluttering the daily boards.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <JourneyStep title="Talk to customer" helper="Calls, texts, intake" icon={PhoneCall} count={checks.find((c) => c.key === "failed-sms")?.count ?? 0} />
          <JourneyStep title="Create the work" helper="NOW cards and approvals" icon={ShieldAlert} count={checks.find((c) => c.key === "workflow-alerts")?.count ?? 0} />
          <JourneyStep title="Run the day" helper="Current dispatch gaps" icon={Truck} count={checks.find((c) => c.key === "dispatch-gaps")?.count ?? 0} />
          <JourneyStep title="Route and ETA" helper="Route messages waiting" icon={Route} count={checks.find((c) => c.key === "route-queue")?.count ?? 0} />
          <JourneyStep title="Imported history" helper="HCP records to review" icon={Database} count={checks.find((c) => c.key === "hcp-residue")?.count ?? 0} />
          <JourneyStep title="Hidden follow-up" helper="Snoozed or acknowledged" icon={Clock3} count={checks.find((c) => c.key === "hidden-cards")?.count ?? 0} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What Needs Eyes</CardTitle>
            <CardDescription>
              These focus on current silent failures. Old Housecall Pro history stays out of the headline count.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {checks.filter((item) => item.tone !== "quiet").map((item) => (
              <WatchCard key={item.key} item={item} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Health Wiring</CardTitle>
            <CardDescription>Places where the app already has a table or trail we should keep feeding.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checks.filter((item) => item.tone === "quiet").map((item) => (
              <WatchCard key={item.key} item={item} />
            ))}
            {dailyRollups === 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <Link2Off className="h-4 w-4" /> Daily cost summaries are empty
                </div>
                Raw API usage may be logging, but the daily summary table is not showing saved rollups yet.
              </div>
            )}
            {(data?.recentErrors ?? []).length > 0 ? (
              <div className="rounded-lg border">
                <div className="border-b px-3 py-2 text-sm font-semibold">Latest open system errors</div>
                <div className="divide-y">
                  {(data?.recentErrors ?? []).map((error: any) => (
                    <div key={error.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{error.source_name || "System"}</span>
                        <Badge variant="outline">{error.severity || "error"}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{error.message || "No message saved."}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> No open system errors showing here
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
