import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEstimates } from "@/hooks/useEstimates";
import { useJobs } from "@/hooks/useJobs";
import { supabase } from "@/integrations/supabase/client";
import { resolveActionItem } from "@/lib/actionItemLifecycle";
import {
  buildEstimateWorkflowCard,
  buildJobWorkflowCard,
  buildLeadWorkflowCard,
  buildActionItemWorkflowCard,
  buildWorkflowAlertCard,
  NOW_HQ_LAUNCH_CUTOFF,
  type WorkflowGroup,
  type WorkflowNowCard,
  type WorkflowOwner,
  type WorkflowStepDefinition,
  type WorkflowTemplateMap,
  type WorkflowType,
} from "@/lib/workflowNow";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { cn } from "@/lib/utils";

type UIMode = "ai" | "human";

const GROUP_META: Record<WorkflowGroup, { label: string; icon: React.ElementType; color: string }> = {
  past_due: { label: "Past due", icon: AlertTriangle, color: "text-red-500" },
  ready: { label: "Ready", icon: CalendarCheck, color: "text-emerald-500" },
  follow_up: { label: "Follow-up", icon: MessageSquare, color: "text-sky-500" },
  closeout: { label: "Closeout", icon: ShieldCheck, color: "text-blue-500" },
  waiting: { label: "Waiting", icon: Clock, color: "text-muted-foreground" },
};

const WORKFLOW_META: Record<WorkflowType, { label: string; icon: React.ElementType; color: string }> = {
  intake: { label: "Intake", icon: MessageSquare, color: "text-orange-600" },
  estimate: { label: "Estimate", icon: FileText, color: "text-amber-600" },
  install: { label: "Install", icon: Wrench, color: "text-blue-600" },
  service: { label: "Service", icon: CalendarCheck, color: "text-emerald-600" },
  lead: { label: "Lead drip", icon: Star, color: "text-violet-600" },
};

const OWNER_LABEL: Record<WorkflowOwner, string> = {
  office: "Office",
  tech: "Tech",
  customer: "Customer",
  system: "System",
};

const HUMAN_TOOLS = [
  { title: "Intake HQ", body: "Answer calls/texts, match customers, and start the right workflow.", to: "/intake", icon: MessageSquare },
  { title: "Dispatch HQ", body: "Classic board for scheduling, routing, and running the day.", to: "/dispatch", icon: CalendarCheck },
  { title: "Quote HQ", body: "Build and follow up on estimates and replacement opportunities.", to: "/quick-quote", icon: FileText },
  { title: "Customer HQ", body: "Look up customer history, jobs, communication, warranty, and attachments.", to: "/customers", icon: Users },
  { title: "Price Book", body: "Equipment, repair catalog, parts, pricing formulas, and AHRI matchups.", to: "/catalog", icon: Wrench },
  { title: "Settings", body: "Manual control for company, team, phone, payments, data, and system health.", to: "/admin", icon: Settings },
];

function parseDate(value?: string | null) {
  if (!value) return null;
  try {
    return parseISO(value.length <= 10 ? `${value}T12:00:00` : value);
  } catch {
    return null;
  }
}

function dueLabel(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "No due date";
  return `${format(date, "EEE, MMM d")} (${formatDistanceToNow(date, { addSuffix: true })})`;
}

function ownerTone(owner: WorkflowOwner) {
  if (owner === "office") return "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200";
  if (owner === "tech") return "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200";
  if (owner === "customer") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  return "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
}

function workflowSort(a: WorkflowNowCard, b: WorkflowNowCard) {
  const groupWeight: Record<WorkflowGroup, number> = { past_due: 0, ready: 1, follow_up: 2, closeout: 3, waiting: 4 };
  const ownerWeight: Record<WorkflowOwner, number> = { office: 0, tech: 1, customer: 2, system: 3 };
  const byGroup = groupWeight[a.group] - groupWeight[b.group];
  if (byGroup !== 0) return byGroup;
  const byOwner = ownerWeight[a.owner] - ownerWeight[b.owner];
  if (byOwner !== 0) return byOwner;
  return (parseDate(a.dueAt)?.getTime() || 0) - (parseDate(b.dueAt)?.getTime() || 0);
}

function isHumanNeeded(card: WorkflowNowCard) {
  if (card.group === "past_due" || card.group === "ready" || card.group === "closeout") return true;
  if (card.owner === "office" || card.owner === "tech") return true;
  return card.workflowType === "lead" && card.group === "follow_up";
}

function workflowUrl(card: WorkflowNowCard) {
  if (card.recordType === "action") {
    return card.customerPhone ? `/intake?phone=${encodeURIComponent(card.customerPhone)}` : "/intake";
  }
  if (card.recordType === "alert") {
    return card.route;
  }
  if (card.recordType === "estimate") {
    return `/quick-quote?estimate_id=${card.recordId}&customer_name=${encodeURIComponent(card.customerName)}${card.customerPhone ? `&customer_phone=${encodeURIComponent(card.customerPhone)}` : ""}`;
  }
  if (card.workflowType === "lead") {
    return `/quick-quote?customer_name=${encodeURIComponent(card.customerName)}${card.customerPhone ? `&customer_phone=${encodeURIComponent(card.customerPhone)}` : ""}`;
  }
  return null;
}

function recordLabel(card: WorkflowNowCard) {
  if (card.recordType === "action") return card.recordNumber ? `Action #${card.recordNumber}` : "Action card";
  if (card.recordType === "alert") return card.recordNumber ? `Blocked #${card.recordNumber}` : "Blocked workflow";
  if (card.recordType === "job") return card.recordNumber ? `Job #${card.recordNumber}` : "Job";
  if (card.recordType === "estimate") return card.recordNumber ? `Estimate #${card.recordNumber}` : "Estimate";
  return card.recordNumber ? `Lead #${card.recordNumber}` : "Lead";
}

function parseWorkflowSteps(value: any): WorkflowStepDefinition[] {
  if (Array.isArray(value)) return value as WorkflowStepDefinition[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

type WorkflowCardActionHandlers = {
  onResolve: (card: WorkflowNowCard) => void;
  onRetry: (card: WorkflowNowCard) => void;
  busyId?: string | null;
};

function WorkflowCard({
  card,
  featured = false,
  onResolve,
  onRetry,
  busyId,
}: {
  card: WorkflowNowCard;
  featured?: boolean;
} & WorkflowCardActionHandlers) {
  const workflow = WORKFLOW_META[card.workflowType];
  const group = GROUP_META[card.group];
  const WorkflowIcon = workflow.icon;
  const GroupIcon = group.icon;
  const secondaryUrl = workflowUrl(card);
  const secondaryLabel = card.recordType === "action" ? "Open in Intake" : card.recordType === "alert" ? "Open record" : "Quick quote";
  const isBusy = busyId === card.id;
  const contextItems = [
    { label: "Record", value: recordLabel(card), href: card.route },
    { label: "Customer", value: card.customerName },
    { label: "Phone", value: card.customerPhone },
    { label: "Address", value: card.address },
    { label: "Status", value: card.status },
    { label: "Type/source", value: card.source },
  ].filter((item) => item.value);

  return (
    <Card className={cn("overflow-hidden border-l-4 shadow-sm", featured ? "border-l-orange-500 bg-orange-500/5" : "border-l-primary/60")}>
      <CardContent className={cn("p-4", featured && "md:p-5")}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <WorkflowIcon className={cn("h-3.5 w-3.5", workflow.color)} />
                {workflow.label}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <GroupIcon className={cn("h-3.5 w-3.5", group.color)} />
                {group.label}
              </Badge>
              <Badge variant="outline" className={ownerTone(card.owner)}>
                {OWNER_LABEL[card.owner]}
              </Badge>
              <Badge variant="secondary">
                Step {card.stepNumber}/{card.totalSteps}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground">{card.customerName}</p>
              <h2 className={cn("mt-1 font-bold tracking-tight", featured ? "text-2xl" : "text-lg")}>{card.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{card.subtitle}</p>
            </div>

            <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm md:grid-cols-2 xl:grid-cols-3">
              {contextItems.map((item) => (
                <div key={item.label} className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  {item.href ? (
                    <Link to={item.href} className="mt-0.5 block truncate font-semibold text-primary underline-offset-2 hover:underline">
                      {item.value}
                    </Link>
                  ) : (
                    <p className="mt-0.5 truncate font-medium">{item.value}</p>
                  )}
                </div>
              ))}
            </div>

            {card.description && (
              <div className="rounded-md border bg-card/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer / job context</p>
                <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{card.description}</p>
              </div>
            )}

            {card.actionLinks?.length ? (
              <div className="rounded-md border bg-card/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Context links</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {card.actionLinks.map((link) => (
                    <a
                      key={`${link.label}-${link.url}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-muted"
                      title={link.when}
                    >
                      {link.label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${card.progress}%` }} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border bg-card/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Why this is here</p>
                <p className="mt-1 text-sm">{card.stuckReason}</p>
              </div>
              <div className="rounded-md border bg-primary/5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jarvis says</p>
                <p className="mt-1 text-sm">{card.jarvisRecommendation}</p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 xl:w-52">
            <div className="rounded-md border bg-card p-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Due</p>
              <p className="mt-1 font-medium">{dueLabel(card.dueAt)}</p>
            </div>
            <Button asChild className="justify-between">
              <Link to={card.route}>
                Open record <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {secondaryUrl && (
              <Button asChild variant="outline" className="justify-between">
                <Link to={secondaryUrl}>
                  {secondaryLabel} <Zap className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {card.customerPhone && (
              <Button
                type="button"
                variant="outline"
                className="justify-between"
                onClick={() => openSmsComposer(card.customerPhone, { contactName: card.customerName })}
              >
                Text customer <MessageSquare className="h-4 w-4" />
              </Button>
            )}
            {card.recordType === "alert" && (
              <Button variant="outline" className="justify-between" disabled={isBusy} onClick={() => onRetry(card)}>
                Retry workflow <Zap className="h-4 w-4" />
              </Button>
            )}
            {(card.recordType === "action" || card.recordType === "alert") && (
              <Button variant="secondary" className="justify-between" disabled={isBusy} onClick={() => onResolve(card)}>
                Mark handled <CheckCircle2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HumanModeFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {HUMAN_TOOLS.map((tool) => {
        const Icon = tool.icon;
        return (
          <Link key={tool.to} to={tool.to} className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold">{tool.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tool.body}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function NowHQ() {
  const [mode, setMode] = useState<UIMode>("ai");
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: jobs = [], isLoading: jobsLoading, isError: jobsError, error: jobsQueryError } = useJobs();
  const { data: estimates = [], isLoading: estimatesLoading, isError: estimatesError, error: estimatesQueryError } = useEstimates(false);
  const { data: actionItems = [], isLoading: actionItemsLoading, isError: actionItemsError, error: actionItemsQueryError } = useQuery({
    queryKey: ["now-hq-action-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_items" as any)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const { data: workflowAlerts = [], isLoading: workflowAlertsLoading, isError: workflowAlertsError, error: workflowAlertsQueryError } = useQuery({
    queryKey: ["now-hq-workflow-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_alerts" as any)
        .select(`
          *,
          jobs:job_id (*)
        `)
        .in("alert_type", ["blocked", "escalated"])
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const { data: leads = [], isLoading: leadsLoading, isError: leadsError, error: leadsQueryError } = useQuery({
    queryKey: ["now-hq-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads" as any)
        .select("*")
        .not("status", "in", '("converted","lost","closed")')
        .gte("created_at", NOW_HQ_LAUNCH_CUTOFF)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const { data: closeoutJobs = [], isLoading: closeoutJobsLoading, isError: closeoutJobsError, error: closeoutJobsQueryError } = useQuery({
    queryKey: ["now-hq-closeout-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs" as any)
        .select("*")
        .in("status", ["done", "completed", "complete", "invoiced"])
        .not("completed_at", "is", null)
        .gte("completed_at", NOW_HQ_LAUNCH_CUTOFF)
        .order("completed_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
  const nowJobIds = useMemo(() => {
    return Array.from(new Set([...(jobs as any[]), ...(closeoutJobs as any[])].map((job) => job.id).filter(Boolean))).sort();
  }, [jobs, closeoutJobs]);
  const jobCartKey = nowJobIds.join("|");
  const { data: jobCarts = [], isLoading: jobCartsLoading, isError: jobCartsError, error: jobCartsQueryError } = useQuery({
    queryKey: ["now-hq-job-carts", jobCartKey],
    enabled: nowJobIds.length > 0,
    queryFn: async () => {
      const { data: carts, error } = await supabase
        .from("job_carts" as any)
        .select("*")
        .in("job_id", nowJobIds)
        .not("status", "in", '("canceled","declined","paid")')
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = ((carts || []) as any[]);
      const cartIds = rows.map((cart) => cart.id).filter(Boolean);
      if (cartIds.length === 0) return rows;

      const { data: cartItems, error: itemError } = await supabase
        .from("job_cart_items" as any)
        .select("cart_id")
        .in("cart_id", cartIds);
      if (itemError) throw itemError;

      const itemCounts = ((cartItems || []) as any[]).reduce((acc, item) => {
        acc.set(item.cart_id, (acc.get(item.cart_id) || 0) + 1);
        return acc;
      }, new Map<string, number>());

      return rows.map((cart) => ({
        ...cart,
        item_count: Number(cart.item_count || itemCounts.get(cart.id) || 0),
      }));
    },
  });
  const { data: workflowTemplates = {}, isLoading: workflowTemplatesLoading, isError: workflowTemplatesError, error: workflowTemplatesQueryError } = useQuery({
    queryKey: ["workflow-definitions-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_definitions" as any)
        .select("job_type, steps")
        .eq("is_active", true);
      if (error) throw error;
      return ((data || []) as any[]).reduce((acc, row) => {
        const type = row.job_type as WorkflowType;
        const steps = parseWorkflowSteps(row.steps);
        if (steps.length) acc[type] = steps;
        return acc;
      }, {} as WorkflowTemplateMap);
    },
  });

  useRealtimeInvalidation(
    [
      { table: "action_items", queryKeys: [["now-hq-action-items"], ["hud_attention_counts"]] },
      { table: "workflow_alerts", queryKeys: [["now-hq-workflow-alerts"], ["hud_attention_counts"]] },
      { table: "jobs", queryKeys: [["jobs"], ["now-hq-closeout-jobs"], ["now-hq-workflow-alerts"], ["hud_attention_counts"]] },
      { table: "job_carts", queryKeys: [["now-hq-job-carts"], ["jobs"], ["hud_attention_counts"]] },
      { table: "job_cart_items", queryKeys: [["now-hq-job-carts"], ["hud_attention_counts"]] },
      { table: "estimates", queryKeys: [["estimates"], ["hud_attention_counts"]] },
      { table: "leads", queryKeys: [["now-hq-leads"], ["hud_attention_counts"]] },
      { table: "workflow_definitions", queryKeys: [["workflow-definitions-active"]] },
    ],
    "now-hq-workflow-sync"
  );

  const refreshNowFeeds = () => {
    queryClient.invalidateQueries({ queryKey: ["now-hq-action-items"] });
    queryClient.invalidateQueries({ queryKey: ["now-hq-workflow-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["now-hq-job-carts"] });
    queryClient.invalidateQueries({ queryKey: ["estimates"] });
    queryClient.invalidateQueries({ queryKey: ["now-hq-leads"] });
    queryClient.invalidateQueries({ queryKey: ["hud_attention_counts"] });
  };

  const resolveCard = useMutation({
    mutationFn: async (card: WorkflowNowCard) => {
      setBusyId(card.id);

      if (card.recordType === "action") {
        await resolveActionItem({
          id: card.recordId,
          status: "accepted",
          userId: user?.id,
          title: card.title,
          activityDetails: `${card.title} marked handled from Now HQ.`,
        });
        return;
      }

      if (card.recordType === "alert") {
        const { data, error } = await supabase.rpc("resolve_workflow_alert_once" as any, {
          p_id: card.recordId,
          p_note: user?.email || "Now HQ",
        });
        if (error) throw error;
        if (data && !(data as any).ok) throw new Error((data as any).reason || "That workflow alert is already handled.");
        return;
      }

      const { error } = await supabase
        .from("action_items" as any)
        .insert({
          source: "now_hq",
          category: "manual_workflow_review",
          priority: "normal",
          title: `Handled: ${card.title}`,
          description: `${card.customerName} - ${card.subtitle}`,
          status: "accepted",
          job_id: card.recordType === "job" ? card.recordId : null,
          customer_phone: card.customerPhone || null,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id || null,
          metadata: {
            workflow_card_id: card.id,
            record_type: card.recordType,
            record_id: card.recordId,
            marked_from: "now_hq",
          },
        });
      if (error) throw error;
    },
    onSuccess: () => {
      refreshNowFeeds();
      toast({ title: "Handled", description: "That card is cleared from the Now queue." });
    },
    onError: (error) => {
      toast({
        title: "Could not clear card",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => setBusyId(null),
  });

  const retryAlert = useMutation({
    mutationFn: async (card: WorkflowNowCard) => {
      setBusyId(card.id);
      if (card.recordType !== "alert") return;
      const { data, error } = await supabase.rpc("retry_workflow_alert_once" as any, {
        p_id: card.recordId,
        p_last_error: card.stuckReason,
      });
      if (error) throw error;
      if (data && !(data as any).ok) throw new Error((data as any).reason || "Could not retry this workflow alert.");
    },
    onSuccess: () => {
      refreshNowFeeds();
      toast({ title: "Retry queued", description: "Jarvis will try that workflow step again and keep the card visible if it still needs help." });
    },
    onError: (error) => {
      toast({
        title: "Retry failed",
        description: error instanceof Error ? error.message : "The workflow alert stayed open.",
        variant: "destructive",
      });
    },
    onSettled: () => setBusyId(null),
  });

  const cards = useMemo(() => {
    const jobCartByJobId = new Map<string, any>();
    for (const cart of (jobCarts as any[])) {
      if (cart.job_id && !jobCartByJobId.has(cart.job_id)) jobCartByJobId.set(cart.job_id, cart);
    }
    const actionCards = (actionItems as any[]).map((item) => buildActionItemWorkflowCard(item, workflowTemplates)).filter(Boolean) as WorkflowNowCard[];
    const alertCards = (workflowAlerts as any[]).map((alert) => buildWorkflowAlertCard(alert, workflowTemplates)).filter(Boolean) as WorkflowNowCard[];
    const alertedJobIds = new Set((workflowAlerts as any[]).map((alert) => alert.job_id).filter(Boolean));
    const jobCards = (jobs as any[])
      .filter((job) => !alertedJobIds.has(job.id))
      .map((job) => buildJobWorkflowCard(job, workflowTemplates, { cart: jobCartByJobId.get(job.id) || null }))
      .filter(Boolean) as WorkflowNowCard[];
    const closeoutJobCards = (closeoutJobs as any[])
      .filter((job) => !alertedJobIds.has(job.id))
      .map((job) => buildJobWorkflowCard(job, workflowTemplates, { cart: jobCartByJobId.get(job.id) || null }))
      .filter(Boolean) as WorkflowNowCard[];
    const estimateCards = (estimates as any[]).map((estimate) => buildEstimateWorkflowCard(estimate, workflowTemplates)).filter(Boolean) as WorkflowNowCard[];
    const leadCards = (leads as any[]).map((lead) => buildLeadWorkflowCard(lead, workflowTemplates)).filter(Boolean) as WorkflowNowCard[];
    return [...alertCards, ...actionCards, ...jobCards, ...closeoutJobCards, ...estimateCards, ...leadCards].sort(workflowSort);
  }, [actionItems, workflowAlerts, jobs, closeoutJobs, jobCarts, estimates, leads, workflowTemplates]);

  const isLoading = actionItemsLoading || workflowAlertsLoading || jobsLoading || closeoutJobsLoading || jobCartsLoading || estimatesLoading || leadsLoading || workflowTemplatesLoading;
  const dataErrors = [
    { label: "workflow cards", active: actionItemsError, error: actionItemsQueryError },
    { label: "workflow alerts", active: workflowAlertsError, error: workflowAlertsQueryError },
    { label: "jobs", active: jobsError, error: jobsQueryError },
    { label: "job closeout", active: closeoutJobsError, error: closeoutJobsQueryError },
    { label: "job carts", active: jobCartsError, error: jobCartsQueryError },
    { label: "estimates", active: estimatesError, error: estimatesQueryError },
    { label: "leads", active: leadsError, error: leadsQueryError },
    { label: "workflow maps", active: workflowTemplatesError, error: workflowTemplatesQueryError },
  ].filter((item) => item.active);
  const humanCards = cards.filter(isHumanNeeded);
  const firstCard = humanCards[0] || cards[0] || null;
  const remainingCards = firstCard ? humanCards.filter((card) => card.id !== firstCard.id).slice(0, 12) : [];
  const jarvisWatching = Math.max(0, cards.length - humanCards.length);
  const counts = {
    intake: cards.filter((card) => card.workflowType === "intake").length,
    estimates: cards.filter((card) => card.workflowType === "estimate").length,
    service: cards.filter((card) => card.workflowType === "service").length,
    installs: cards.filter((card) => card.workflowType === "install").length,
    pastDue: cards.filter((card) => card.group === "past_due").length,
    closeout: cards.filter((card) => card.group === "closeout").length,
    leads: cards.filter((card) => card.workflowType === "lead").length,
    blocked: cards.filter((card) => card.recordType === "alert").length,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <section className="border-b bg-card px-4 py-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-500/10 text-orange-500">
                  <Zap className="h-5 w-5" />
                </span>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Now HQ</h1>
                  <p className="text-sm text-muted-foreground">
                    Humans help customers. Jarvis tracks the process and shows only what needs attention now.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex rounded-md border bg-muted p-1">
              <button
                type="button"
                onClick={() => setMode("ai")}
                className={cn("flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold", mode === "ai" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}
              >
                <Bot className="h-4 w-4" /> AI Mode
              </button>
              <button
                type="button"
                onClick={() => setMode("human")}
                className={cn("flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold", mode === "human" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
              >
                <LayoutDashboard className="h-4 w-4" /> Human Mode
              </button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-4 p-4">
          {dataErrors.length > 0 && (
            <Card className="border-red-500/40 bg-red-500/10">
              <CardContent className="flex flex-col gap-3 p-4 text-sm md:flex-row md:items-start">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-red-900 dark:text-red-100">Now HQ could not load every work feed.</p>
                  <p className="mt-1 text-red-800/80 dark:text-red-100/80">
                    This board may be missing cards until the connection recovers. Failed feed{dataErrors.length === 1 ? "" : "s"}: {dataErrors.map((item) => item.label).join(", ")}.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {mode === "ai" ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Card className="bg-orange-500/5">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">{humanCards.length}</p>
                    <p className="text-xs text-muted-foreground">need a human</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">{jarvisWatching}</p>
                    <p className="text-xs text-muted-foreground">Jarvis is watching</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">{counts.pastDue}</p>
                    <p className="text-xs text-muted-foreground">past due</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">{counts.closeout}</p>
                    <p className="text-xs text-muted-foreground">closeout cards</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Do this now</h2>
                    <p className="text-sm text-muted-foreground">This is the top card Jarvis thinks needs human attention.</p>
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-64 w-full rounded-lg" />
                  ) : firstCard ? (
                    <WorkflowCard
                      card={firstCard}
                      featured
                      onResolve={(card) => resolveCard.mutate(card)}
                      onRetry={(card) => retryAlert.mutate(card)}
                      busyId={busyId}
                    />
                  ) : (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                        <CheckCircle2 className="h-9 w-9 text-emerald-500" />
                        <div>
                          <p className="font-semibold">Nothing needs a human right now</p>
                          <p className="text-sm text-muted-foreground">Jarvis will keep watching workflows and surface the next thing when it matters.</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {remainingCards.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Next up</h2>
                      {remainingCards.map((card) => (
                        <WorkflowCard
                          key={card.id}
                          card={card}
                          onResolve={(selected) => resolveCard.mutate(selected)}
                          onRetry={(selected) => retryAlert.mutate(selected)}
                          busyId={busyId}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <aside className="space-y-4">
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="space-y-3 p-4 text-sm">
                      <div className="flex items-center gap-2 font-semibold">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Jarvis operating rule
                      </div>
                      <p className="text-muted-foreground">
                        Intake listens and talks. Now owns the living action cards. When a customer calls or texts again, Jarvis should update the open card before creating another one.
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">What Jarvis is tracking</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between"><span>Live intake actions</span><strong>{counts.intake}</strong></div>
                      <div className="flex justify-between"><span>Estimate workflows</span><strong>{counts.estimates}</strong></div>
                      <div className="flex justify-between"><span>Service workflows</span><strong>{counts.service}</strong></div>
                      <div className="flex justify-between"><span>Installer workflows</span><strong>{counts.installs}</strong></div>
                      <div className="flex justify-between"><span>Lead drip</span><strong>{counts.leads}</strong></div>
                      <div className="flex justify-between"><span>Warranty / rebate / inspection</span><strong>{counts.closeout}</strong></div>
                      <div className="flex justify-between"><span>Past due exceptions</span><strong>{counts.pastDue}</strong></div>
                      <div className="flex justify-between"><span>Silent workflow cards</span><strong>{jarvisWatching}</strong></div>
                    </CardContent>
                  </Card>
                </aside>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">Human Mode</h2>
                <p className="text-sm text-muted-foreground">Manual dashboards are here when you need to verify, override, or work without AI help.</p>
              </div>
              <HumanModeFallback />
            </div>
          )}

        </section>
      </main>
    </div>
  );
}
