import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Ban,
  CheckCircle2,
  Clock,
  CircleDot,
  Eye,
  FileCheck2,
  FileText,
  Hourglass,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuotePipelineMap, type QuotePipelineRow } from "@/hooks/useCanonicalOperations";
import { useEstimates, type Estimate } from "@/hooks/useEstimates";
import { supabase } from "@/integrations/supabase/client";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { cn } from "@/lib/utils";

type QuoteStage = "needs_quote" | "needs_send" | "waiting" | "viewed" | "aging" | "approved";

type PresentationSummary = {
  estimate_id: string;
  token: string;
  created_at: string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number | null;
};

type ResponseSummary = {
  estimate_id: string;
  action: string;
  message: string | null;
  responded_at: string;
  selected_tier: string | null;
  payment_preference: string | null;
};

type QuotePipelineItem = {
  estimate: Estimate;
  canonical?: QuotePipelineRow;
  stage: QuoteStage;
  stageLabel: string;
  ageDays: number;
  nextAction: string;
  draft: string;
  presentation?: PresentationSummary;
  response?: ResponseSummary;
};

type SignalVisual = {
  label: string;
  Icon: LucideIcon;
  className: string;
};

const STAGE_LABELS: Record<QuoteStage, string> = {
  needs_quote: "Needs quote",
  needs_send: "Ready to send",
  waiting: "Waiting",
  viewed: "Viewed",
  aging: "Aging",
  approved: "Approved",
};

function safeDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return parseISO(value);
  } catch {
    return null;
  }
}

function daysSince(value: string | null | undefined) {
  const date = safeDate(value);
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function shortDate(value: string | null | undefined) {
  const date = safeDate(value);
  if (!date) return "Not set";
  return format(date, "MMM d, yyyy");
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message?: unknown }).message || "Unknown error");
  return "Unknown error";
}

function firstName(estimate: Estimate) {
  return (estimate.customer_name || "there").split(" ")[0] || "there";
}

function moneyFromEstimate(estimate: Estimate) {
  const options = estimate.options;
  const candidates = [
    options?.total,
    options?.total_price,
    options?.price,
    Array.isArray(options) ? options[0]?.total : null,
    Array.isArray(options) ? options[0]?.total_price : null,
  ];
  const value = candidates.find((v) => Number(v) > 0);
  return Number(value || 0);
}

function draftFor(stage: QuoteStage, estimate: Estimate) {
  const name = firstName(estimate);
  const number = estimate.estimate_number ? ` #${estimate.estimate_number}` : "";
  if (stage === "needs_quote") {
    return `Hi ${name}, we are putting together your quote${number}. I will send it over as soon as it is ready for you to review.`;
  }
  if (stage === "needs_send") {
    return `Hi ${name}, your quote${number} is ready. I can send the review link over so you can look at the options and approve the one you like.`;
  }
  if (stage === "viewed") {
    return `Hi ${name}, I saw you had a chance to look at your quote${number}. Any questions on the options, warranty, financing, or rebate details?`;
  }
  if (stage === "aging") {
    return `Hi ${name}, just checking in on quote${number}. Do you still want us to keep this option open, revise it, or close it out for now?`;
  }
  if (stage === "approved") {
    return `Hi ${name}, thank you for approving quote${number}. We are reviewing the next step so we can get the installation scheduled.`;
  }
  return `Hi ${name}, just following up on quote${number}. Do you have any questions or would you like help choosing the best option?`;
}

function quoteStageFromReadModel(row?: QuotePipelineRow): QuoteStage | null {
  const stage = String(row?.pipeline_stage || "").toLowerCase();
  if (!stage) return null;
  if (stage.includes("approved")) return "approved";
  if (stage.includes("waiting")) return "waiting";
  if (stage.includes("scheduled")) return "waiting";
  if (stage.includes("next")) return "needs_quote";
  return null;
}

function stageVisual(stage: QuoteStage): SignalVisual {
  if (stage === "approved") {
    return {
      label: "Approved",
      Icon: CheckCircle2,
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (stage === "aging") {
    return {
      label: "Aging",
      Icon: AlertTriangle,
      className: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    };
  }
  if (stage === "viewed") {
    return {
      label: "Viewed",
      Icon: Eye,
      className: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    };
  }
  if (stage === "needs_send") {
    return {
      label: "Ready to send",
      Icon: Send,
      className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (stage === "needs_quote") {
    return {
      label: "Needs quote",
      Icon: FileText,
      className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  return {
    label: "Waiting",
    Icon: Hourglass,
    className: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  };
}

function followUpVisual(item: QuotePipelineItem): SignalVisual {
  if (item.stage === "approved") {
    return {
      label: "Approved handoff",
      Icon: FileCheck2,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (item.stage === "aging") {
    return {
      label: "Follow-up needed",
      Icon: AlertCircle,
      className: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    };
  }
  if (item.stage === "viewed") {
    return {
      label: "Warm quote",
      Icon: Phone,
      className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    };
  }
  if (item.stage === "needs_send") {
    return {
      label: "Send quote",
      Icon: Send,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (item.stage === "needs_quote") {
    return {
      label: "Build quote",
      Icon: FileText,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  return {
    label: "Monitor",
    Icon: Clock,
    className: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  };
}

function outcomeSignals(estimate: Estimate, response?: ResponseSummary): SignalVisual[] {
  const rawStatus = `${estimate.work_status || ""} ${estimate.status || ""} ${response?.action || ""}`.toLowerCase();
  const signals: SignalVisual[] = [];

  if (response?.action === "approved" || estimate.customer_approved_at) {
    signals.push({
      label: "Customer approved",
      Icon: CheckCircle2,
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    });
  }
  if (rawStatus.includes("blocked") || rawStatus.includes("hold")) {
    signals.push({
      label: "Blocked",
      Icon: Ban,
      className: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    });
  }
  if (rawStatus.includes("won")) {
    signals.push({
      label: "Won",
      Icon: BadgeDollarSign,
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    });
  }
  if (rawStatus.includes("lost") || rawStatus.includes("canceled")) {
    signals.push({
      label: rawStatus.includes("canceled") ? "Canceled" : "Lost",
      Icon: XCircle,
      className: "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    });
  }

  return signals;
}

function stageAccentClass(stage: QuoteStage) {
  if (stage === "approved") return "border-l-emerald-500";
  if (stage === "aging") return "border-l-orange-500";
  if (stage === "viewed") return "border-l-blue-500";
  if (stage === "needs_quote" || stage === "needs_send") return "border-l-amber-500";
  return "border-l-slate-400";
}

function buildPipelineItem(
  estimate: Estimate,
  presentations: Map<string, PresentationSummary>,
  responses: Map<string, ResponseSummary>,
  canonical?: QuotePipelineRow,
): QuotePipelineItem {
  const presentation = presentations.get(estimate.id);
  const response = responses.get(estimate.id);
  const ageDays = daysSince(estimate.presentation_sent_at || presentation?.created_at || estimate.created_at);
  const hasQuote = Boolean(presentation || estimate.presentation_sent_at);
  const hasViewed = Boolean(presentation?.first_viewed_at || presentation?.last_viewed_at || (presentation?.view_count || 0) > 0);

  let stage: QuoteStage = "waiting";
  let nextAction = "Follow up with customer";

  if (response?.action === "approved" || estimate.customer_approved_at) {
    stage = "approved";
    nextAction = "Convert approved quote";
  } else if (!hasQuote) {
    stage = "needs_quote";
    nextAction = "Build customer presentation";
  } else if (!estimate.presentation_sent_at) {
    stage = "needs_send";
    nextAction = "Send quote link";
  } else if (ageDays >= 7) {
    stage = "aging";
    nextAction = "Send final check-in";
  } else if (hasViewed) {
    stage = "viewed";
    nextAction = "Call or text while warm";
  } else {
    stage = "waiting";
    nextAction = ageDays >= 2 ? "Text reminder" : "Wait for customer";
  }

  const canonicalStage = quoteStageFromReadModel(canonical);
  if (canonicalStage && canonicalStage !== stage) {
    stage = canonicalStage;
    if (canonical?.pipeline_stage) nextAction = canonical.pipeline_stage;
  }

  return {
    estimate,
    canonical,
    stage,
    stageLabel: STAGE_LABELS[stage],
    ageDays,
    nextAction,
    draft: draftFor(stage, estimate),
    presentation,
    response,
  };
}

function StageBadge({ stage }: { stage: QuoteStage }) {
  const visual = stageVisual(stage);
  const Icon = visual.Icon;

  return (
    <span
      title={visual.label}
      aria-label={visual.label}
      className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", visual.className)}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

export default function QuoteHeadquarters() {
  const navigate = useNavigate();
  const { data: estimates = [], isLoading, isError: estimatesError, error: estimatesQueryError } = useEstimates(false);
  const {
    byEstimateId: quotePipelineById,
    isLoading: quotePipelineLoading,
    isError: quotePipelineError,
    error: quotePipelineQueryError,
  } = useQuotePipelineMap(300);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<QuoteStage | "all">("all");

  const estimateIds = useMemo(() => estimates.map((e) => e.id), [estimates]);

  const {
    data: presentations = [],
    isError: presentationsError,
    error: presentationsQueryError,
  } = useQuery({
    queryKey: ["quote-hq-presentations", estimateIds],
    enabled: estimateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_presentations" as any)
        .select("estimate_id, token, created_at, first_viewed_at, last_viewed_at, view_count")
        .in("estimate_id", estimateIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PresentationSummary[];
    },
  });

  const {
    data: responses = [],
    isError: responsesError,
    error: responsesQueryError,
  } = useQuery({
    queryKey: ["quote-hq-responses", estimateIds],
    enabled: estimateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_responses" as any)
        .select("estimate_id, action, message, responded_at, selected_tier, payment_preference")
        .in("estimate_id", estimateIds)
        .order("responded_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ResponseSummary[];
    },
  });

  const pipeline = useMemo(() => {
    const presentationMap = new Map<string, PresentationSummary>();
    for (const presentation of presentations) {
      if (!presentationMap.has(presentation.estimate_id)) presentationMap.set(presentation.estimate_id, presentation);
    }

    const responseMap = new Map<string, ResponseSummary>();
    for (const response of responses) {
      if (!responseMap.has(response.estimate_id)) responseMap.set(response.estimate_id, response);
    }

    return estimates
      .map((estimate) => buildPipelineItem(estimate, presentationMap, responseMap, quotePipelineById.get(estimate.id)))
      .sort((a, b) => {
        const priority: Record<QuoteStage, number> = {
          approved: 0,
          viewed: 1,
          aging: 2,
          needs_send: 3,
          needs_quote: 4,
          waiting: 5,
        };
        if (priority[a.stage] !== priority[b.stage]) return priority[a.stage] - priority[b.stage];
        return b.ageDays - a.ageDays;
      });
  }, [estimates, presentations, responses, quotePipelineById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pipeline.filter((item) => {
      if (stageFilter !== "all" && item.stage !== stageFilter) return false;
      if (!q) return true;
      const e = item.estimate;
      return [
        e.estimate_number,
        e.customer_name,
        e.customer_phone,
        e.customer_email,
        e.address,
        e.description,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [pipeline, search, stageFilter]);

  const counts = useMemo(() => {
    const result: Record<QuoteStage, number> = {
      needs_quote: 0,
      needs_send: 0,
      waiting: 0,
      viewed: 0,
      aging: 0,
      approved: 0,
    };
    for (const item of pipeline) result[item.stage] += 1;
    return result;
  }, [pipeline]);

  const totalValue = pipeline.reduce((sum, item) => sum + moneyFromEstimate(item.estimate), 0);
  const quoteDataIssues = [
    estimatesError ? `estimates (${errorMessage(estimatesQueryError)})` : null,
    quotePipelineError ? `quote tracking (${errorMessage(quotePipelineQueryError)})` : null,
    presentationsError ? `presentation views (${errorMessage(presentationsQueryError)})` : null,
    responsesError ? `customer responses (${errorMessage(responsesQueryError)})` : null,
  ].filter(Boolean);

  const openSmsDraft = (item: QuotePipelineItem) => {
    const phone = item.estimate.customer_phone;
    if (!phone) return;
    openSmsComposer(phone, {
      contactName: item.estimate.customer_name || undefined,
      draft: item.draft,
    });
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search open quotes"
      />
      <main className="mx-auto max-w-[1600px] space-y-5 p-5">
        <section className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Quote follow-up</p>
              <div className="mt-1 flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Quote HQ</h1>
                <Badge variant="secondary">Office-approved follow-ups</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Open quotes, ready-to-send follow-ups, what the customer has done, and the next closing step.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => navigate("/reports")}>
                <TrendingUp className="h-4 w-4" />
                Quote report
              </Button>
              <Button className="gap-2" onClick={() => navigate("/quote-builder")}>
                <Plus className="h-4 w-4" />
                Build quote
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={FileText} label="Open quotes" value={`${pipeline.length}`} detail="Not won, lost, or canceled" />
            <MetricCard icon={Eye} label="Viewed" value={`${counts.viewed}`} detail="Customers who opened the quote" />
            <MetricCard icon={Clock} label="Aging" value={`${counts.aging}`} detail="Seven or more days open" />
            <MetricCard icon={CheckCircle2} label="Approved" value={`${counts.approved}`} detail="Needs install handoff" />
            <MetricCard
              icon={BadgeDollarSign}
              label="Visible value"
              value={totalValue > 0 ? `$${totalValue.toLocaleString()}` : "TBD"}
              detail="Based on quote option data when present"
            />
          </div>
        </section>

        {quoteDataIssues.length > 0 && (
          <Card className="border-amber-300 bg-amber-50 shadow-none dark:border-amber-800 dark:bg-amber-950/40">
            <CardContent className="flex items-start gap-2 p-4 text-sm text-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Quote HQ is open, but part of the follow-up picture did not load: {quoteDataIssues.join(", ")}. Refresh before approving follow-ups.
              </p>
            </CardContent>
          </Card>
        )}

        <section className="rounded-lg border bg-background p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
            <Tabs value={stageFilter} onValueChange={(value) => setStageFilter(value as QuoteStage | "all")}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="viewed">Viewed</TabsTrigger>
                <TabsTrigger value="aging">Aging</TabsTrigger>
                <TabsTrigger value="needs_send">Ready</TabsTrigger>
                <TabsTrigger value="needs_quote">Needs quote</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </section>

        {isLoading || quotePipelineLoading ? (
          <div className="grid gap-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="shadow-none">
            <CardContent className="py-14 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="font-semibold">No open quotes match this view</p>
              <p className="mt-1 text-sm text-muted-foreground">Won, lost, and canceled estimates are hidden from Quote HQ.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((item) => (
              <QuotePipelineCard
                key={item.estimate.id}
                item={item}
                onOpen={() => navigate(`/estimates/${item.estimate.id}`)}
                onBuild={() => navigate(`/quote-builder?estimate_id=${item.estimate.id}`)}
                onSms={() => openSmsDraft(item)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: any;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QuotePipelineCard({
  item,
  onOpen,
  onBuild,
  onSms,
}: {
  item: QuotePipelineItem;
  onOpen: () => void;
  onBuild: () => void;
  onSms: () => void;
}) {
  const estimate = item.estimate;
  const quoteNumber = estimate.estimate_number ? `#${estimate.estimate_number}` : estimate.id.slice(0, 8);
  const canText = Boolean(estimate.customer_phone);
  const amount = moneyFromEstimate(estimate);
  const followUp = followUpVisual(item);
  const FollowUpIcon = followUp.Icon;
  const signals = outcomeSignals(estimate, item.response);
  const latestCommunicationDate = safeDate(item.canonical?.latest_communication_at);
  const lastTouched =
    item.response?.responded_at ||
    item.presentation?.last_viewed_at ||
    item.canonical?.latest_communication_at ||
    item.presentation?.created_at ||
    estimate.presentation_sent_at ||
    estimate.created_at;
  const lastTouchedDate = safeDate(lastTouched);

  return (
    <Card
      className={cn(
        "border-l-4 shadow-none transition-colors hover:border-y-primary/40 hover:border-r-primary/40",
        stageAccentClass(item.stage),
      )}
    >
      <CardContent className="grid gap-4 p-4 xl:grid-cols-[1.25fr_0.75fr_1fr_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <StageBadge stage={item.stage} />
            <button className="text-left text-lg font-bold hover:underline" onClick={onOpen}>
              {estimate.customer_name || "Unnamed customer"}
            </button>
            <Badge variant="outline" className="rounded-sm text-[10px] font-semibold">
              Quote {quoteNumber}
            </Badge>
            {signals.map((signal) => {
              const Icon = signal.Icon;
              return (
                <span
                  key={signal.label}
                  title={signal.label}
                  aria-label={signal.label}
                  className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full border", signal.className)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              );
            })}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {estimate.description || estimate.address || "No quote description yet"}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <BadgeDollarSign className="h-3.5 w-3.5" />
              <span className="font-semibold text-foreground">{amount > 0 ? `$${amount.toLocaleString()}` : "TBD"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              {estimate.customer_phone || "No phone"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {estimate.customer_email || "No email"}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{estimate.address || "No address"}</span>
            </span>
          </div>
        </div>

        <div className="grid gap-2 text-sm">
          <InfoRow icon={CircleDot} label="Created" value={shortDate(estimate.created_at)} />
          <InfoRow icon={Send} label="Sent" value={shortDate(estimate.presentation_sent_at || item.presentation?.created_at)} />
          <InfoRow
            icon={Eye}
            label="Viewed"
            value={
              item.presentation?.view_count
                ? `${item.presentation.view_count} view${item.presentation.view_count === 1 ? "" : "s"}`
                : "No views"
            }
          />
        </div>

        <div className={cn("rounded-md border p-3", followUp.className)}>
          <div className="flex items-start gap-2">
            <FollowUpIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{item.nextAction}</p>
                <Sparkles className="h-3.5 w-3.5 text-current" aria-label={followUp.label} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.draft}</p>
          <p className="mt-2 text-xs text-muted-foreground/90">
            {lastTouchedDate
              ? formatDistanceToNow(lastTouchedDate, { addSuffix: true })
              : "No recent activity"}
          </p>
          {item.canonical?.latest_communication_summary && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              Last {item.canonical.latest_communication_type || "message"}
              {latestCommunicationDate ? ` ${formatDistanceToNow(latestCommunicationDate, { addSuffix: true })}` : ""}:{" "}
              {item.canonical.latest_communication_summary}
            </p>
          )}
        </div>
      </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button variant="outline" className="gap-2" onClick={onOpen}>
            <FileText className="h-4 w-4" />
            Open
          </Button>
          <Button variant="outline" className="gap-2" onClick={onBuild}>
            <ArrowRight className="h-4 w-4" />
            Build
          </Button>
          <Button className="gap-2" onClick={onSms} disabled={!canText}>
            {item.stage === "viewed" ? <Phone className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            Draft text
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
