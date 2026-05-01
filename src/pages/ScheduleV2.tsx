import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  formatDistanceToNow,
  isSameDay,
  isToday,
  parseISO,
  startOfWeek,
  subDays,
} from "date-fns";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  Filter,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Plus,
  Route,
  Send,
  Sparkles,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MmsMediaRenderer } from "@/components/chat/MmsMediaRenderer";
import { AskJarvisButton } from "@/components/jarvis/AskJarvisButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JobPhotosGrid } from "@/components/job/JobPhotosGrid";
import { WeatherBadge } from "@/components/weather/WeatherBadge";
import { useDispatchLiveCards, type DispatchLiveCardContext } from "@/hooks/useDispatchLiveCards";
import { useEmployees } from "@/hooks/useEmployees";
import { useEstimates } from "@/hooks/useEstimates";
import { useJobs } from "@/hooks/useJobs";
import { useTechStatusMap, type TechStatusInfo } from "@/hooks/useTechStatusMap";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import { toast } from "@/hooks/use-toast";
import { useCallLog, type CallConversation } from "@/hooks/useCallLog";
import { useSmsLog, type SmsConversation } from "@/hooks/useSmsLog";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone, toE164 } from "@/lib/formatters";
import { normalizeMediaAttachments } from "@/lib/mediaAttachments";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { cn } from "@/lib/utils";

type ScheduleItem = {
  id: string;
  item_type: "job" | "estimate";
  customer_name: string | null;
  customer_id: string | null;
  address: string | null;
  description: string | null;
  assigned_to: string | null;
  scheduled_date: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  job_type: string;
  status?: string | null;
  work_status?: string | null;
  job_number?: string | null;
  hcp_job_number?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
};

type CommunicationItem = {
  id: string;
  kind: "call" | "sms";
  direction: "inbound" | "outbound";
  name: string;
  phone: string;
  summary: string;
  detail: string;
  time: string;
  createdAt: string;
  status: string;
  latestJobId?: string | null;
  raw: CallConversation | SmsConversation;
};

function communicationVisual(item: Pick<CommunicationItem, "kind" | "direction">) {
  const isInbound = item.direction === "inbound";
  if (item.kind === "call") {
    return {
      label: isInbound ? "Inbound phone call" : "Outbound phone call",
      Icon: Phone,
      DirectionIcon: isInbound ? ArrowDownLeft : ArrowUpRight,
      className: isInbound ? "bg-sky-700 text-white" : "bg-indigo-700 text-white",
    };
  }
  return {
    label: isInbound ? "Inbound text message" : "Outbound text message",
    Icon: isInbound ? MessageSquare : Send,
    DirectionIcon: isInbound ? ArrowDownLeft : ArrowUpRight,
    className: isInbound ? "bg-teal-700 text-white" : "bg-slate-700 text-white",
  };
}

type DispatchMode = "ai" | "human";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "estimate", label: "Estimates" },
  { value: "install", label: "Installs" },
  { value: "service", label: "Service" },
  { value: "maintenance", label: "Maint." },
];

const STATUS_DONE = new Set(["done", "invoiced", "canceled", "cancelled", "completed"]);

function normalizeTime(value?: string | null) {
  if (!value) return "Any time";
  if (value.includes("T")) return format(parseISO(value), "h:mm a");
  const [hourRaw, minute = "00"] = value.split(":");
  const hour = Number(hourRaw);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.padStart(2, "0")} ${suffix}`;
}

function itemTone(item: ScheduleItem) {
  const type = item.item_type === "estimate" ? "estimate" : item.job_type;
  if (type === "install") return "border-l-primary bg-primary/5";
  if (type === "estimate") return "border-l-sky-500 bg-sky-50/70 dark:bg-sky-950/20";
  if (type === "maintenance") return "border-l-[hsl(var(--success))] bg-[hsl(var(--complete-bg))]/60";
  return "border-l-[hsl(var(--accent))] bg-[hsl(var(--warm-light))]/60";
}

function itemLabel(item: ScheduleItem) {
  if (item.item_type === "estimate") return "Estimate";
  if (!item.job_type) return "Job";
  return item.job_type.charAt(0).toUpperCase() + item.job_type.slice(1);
}

function getEmployeeName(employees: any[] = [], assignedTo?: string | null) {
  if (!assignedTo) return "Unassigned";
  return employees.find((employee) => employee.id === assignedTo)?.name || assignedTo;
}

function getEmployeeId(employees: any[] = [], assignedTo?: string | null) {
  if (!assignedTo) return null;
  const employee = employees.find((emp) => emp.id === assignedTo || emp.name === assignedTo);
  return employee?.id || null;
}

function buildTimeRange(item: ScheduleItem) {
  if (!item.arrival_start && !item.arrival_end) return "Any time";
  if (item.arrival_start && item.arrival_end) {
    return `${normalizeTime(item.arrival_start)} - ${normalizeTime(item.arrival_end)}`;
  }
  return normalizeTime(item.arrival_start || item.arrival_end);
}

function relativeTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

function techStatusLabel(status?: TechStatusInfo | null) {
  if (!status) return null;
  if (status.status === "on_site") return "On site";
  if (status.status === "at_supply_house") return status.locationName ? `At ${status.locationName}` : "At supply";
  return "En route";
}

function liveToneClass(context?: DispatchLiveCardContext) {
  if (!context || context.liveTone === "quiet") return "border-border bg-muted/40 text-muted-foreground";
  if (context.liveTone === "attention") return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100";
  return "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-100";
}

function formatCallTime(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return format(date, "MMM d, h:mm a");
}

function summarizeCallIntent(conversation: CallConversation) {
  const call = conversation.lastCall;
  const extracted = call.extracted_data || {};
  const guessed =
    extracted.intent ||
    extracted.customer_intent ||
    extracted.action ||
    extracted.booking_intent ||
    null;
  if (typeof guessed === "string" && guessed.trim()) return guessed.replaceAll("_", " ");
  if (call.ai_summary) return call.ai_summary;
  if (call.transcription) return call.transcription;
  if (call.direction === "inbound" && call.status === "completed") return "Incoming call ready for review";
  if (call.direction === "outbound") return "Outbound call";
  return call.status || "Call logged";
}

function summarizeSmsIntent(conversation: SmsConversation) {
  const latest = conversation.lastMessage;
  if (conversation.status === "needs_reply") return "Needs reply";
  if (conversation.latestJobId || conversation.jobContext) return "Customer text tied to a job";
  if (latest.direction === "inbound") return "Incoming text";
  return "Outbound text";
}

function buildQuickQuoteUrl(item: ScheduleItem) {
  const params = new URLSearchParams();
  if (item.item_type === "estimate") {
    params.set("estimate_id", item.id);
  } else {
    params.set("job_id", item.id);
  }
  if (item.customer_name) params.set("customer_name", item.customer_name);
  if (item.customer_phone) params.set("customer_phone", item.customer_phone);
  if (item.customer_email) params.set("customer_email", item.customer_email);
  return `/quick-quote?${params.toString()}`;
}

function callConversationToItem(conversation: CallConversation): CommunicationItem {
  const call = conversation.lastCall;
  const name = conversation.contactName || formatPhone(conversation.phoneNumber) || conversation.phoneNumber;
  return {
    id: `call-${call.id}`,
    kind: "call",
    direction: call.direction,
    name,
    phone: conversation.phoneNumber,
    summary: summarizeCallIntent(conversation),
    detail: call.ai_summary || call.transcription || "Open the call to review what happened and what dispatch should do next.",
    time: call.time_ct || formatCallTime(call.created_at),
    createdAt: call.created_at,
    status: call.status || "logged",
    latestJobId: (call as any).related_job_id || null,
    raw: conversation,
  };
}

function smsConversationToItem(conversation: SmsConversation): CommunicationItem {
  const latest = conversation.lastMessage;
  const name = conversation.contactName || formatPhone(conversation.phoneNumber) || conversation.phoneNumber;
  return {
    id: `sms-${latest.id}`,
    kind: "sms",
    direction: latest.direction,
    name,
    phone: conversation.phoneNumber,
    summary: summarizeSmsIntent(conversation),
    detail: latest.body || "Open the text to review the latest message.",
    time: latest.time_ct || formatCallTime(latest.created_at),
    createdAt: latest.created_at,
    status: conversation.status,
    latestJobId: conversation.latestJobId,
    raw: conversation,
  };
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  action,
}: {
  label: string;
  value: string | number;
  detail: React.ReactNode;
  icon: typeof CalendarDays;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-2 flex min-h-5 items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="min-w-0">{detail}</div>
        {action}
      </div>
    </div>
  );
}

function JobCard({
  item,
  employees,
  liveContext,
  techStatus,
  compact = false,
  onClick,
  onOpenMedia,
}: {
  item: ScheduleItem;
  employees: any[];
  liveContext?: DispatchLiveCardContext;
  techStatus?: TechStatusInfo | null;
  compact?: boolean;
  onClick: () => void;
  onOpenMedia?: () => void;
}) {
  const statusLabel = techStatusLabel(techStatus);
  const hasFieldSignal = !!liveContext && (
    liveContext.attachmentCount > 0 ||
    liveContext.responseCount > 0 ||
    liveContext.suggestedItemCount > 0 ||
    !!liveContext.latestTechNote ||
    !!liveContext.latestActivity
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-l-4 bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md",
        itemTone(item),
        compact && "p-2.5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{item.customer_name || "No customer name"}</p>
            <Badge variant="outline" className="shrink-0 text-[10px]">{itemLabel(item)}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.address || "No address on file"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-semibold text-foreground">{buildTimeRange(item)}</p>
          <p className="text-[10px] text-muted-foreground">
            {item.job_number || item.hcp_job_number || item.id.slice(0, 6)}
          </p>
        </div>
      </div>
      {!compact && (
        <>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{getEmployeeName(employees, item.assigned_to)}</span>
            </span>
            {statusLabel && (
              <Badge variant="secondary" className="h-6 shrink-0 px-2 text-[10px]">
                {statusLabel}
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {item.item_type === "job" && (
              <span
                className={cn(
                  "flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border bg-background px-1.5 text-muted-foreground",
                  liveContext?.attachmentCount && "text-primary"
                )}
                role="img"
                aria-label="Open job attachments"
                title="Open job attachments"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMedia?.();
                }}
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                {liveContext?.attachmentCount ? <span className="text-[10px] font-semibold">{liveContext.attachmentCount}</span> : null}
              </span>
            )}
            <span className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground" role="img" aria-label="Call customer" title="Call customer">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground" role="img" aria-label="Text customer" title="Text customer">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground" role="img" aria-label="Route stop" title="Route stop">
              <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>
        {hasFieldSignal && (
          <div className={cn("mt-3 rounded-md border p-2 text-xs leading-5", liveToneClass(liveContext))}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{liveContext.liveSummary}</span>
              </span>
              {liveContext.latestTechNote?.createdAt && (
                <span className="shrink-0 text-[10px] opacity-75">{relativeTime(liveContext.latestTechNote.createdAt)}</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {liveContext.responseCount > 0 && <Badge variant="outline" className="h-5 text-[10px]">{liveContext.responseCount} checklist</Badge>}
              {liveContext.suggestedItemCount > 0 && <Badge variant="outline" className="h-5 text-[10px]">{liveContext.suggestedItemCount} suggested</Badge>}
              {liveContext.attachmentCount > 0 && <Badge variant="outline" className="h-5 text-[10px]">{liveContext.attachmentCount} media</Badge>}
            </div>
          </div>
        )}
        </>
      )}
    </button>
  );
}

function RailSection({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function BoardCommandRail({
  mode,
  criticalItems,
  unscheduledItems,
  dayItems,
  routeReadyCount,
  employees,
  onItemClick,
  onCommunicationClick,
}: {
  mode: DispatchMode;
  criticalItems: ScheduleItem[];
  unscheduledItems: ScheduleItem[];
  dayItems: ScheduleItem[];
  routeReadyCount: number;
  employees: any[];
  onItemClick: (item: ScheduleItem) => void;
  onCommunicationClick: (item: CommunicationItem) => void;
}) {
  const navigate = useNavigate();
  const { conversations, loading: callsLoading } = useCallLog();
  const { conversations: smsConversations, loading: smsLoading } = useSmsLog();
  const openSlots = Math.max(0, (employees || []).filter((employee: any) => employee.is_active !== false).length * 3 - dayItems.length);
  const unassigned = dayItems.filter((item) => !item.assigned_to);
  const firstCritical = criticalItems[0] || null;
  const firstBacklog = unscheduledItems[0] || null;
  const communicationItems = useMemo(() => {
    const callItems = conversations.slice(0, 8).map(callConversationToItem);
    const smsItems = smsConversations.slice(0, 8).map(smsConversationToItem);
    return [...callItems, ...smsItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 7);
  }, [conversations, smsConversations]);

  return (
    <aside className="space-y-3">
      <RailSection
        title={mode === "ai" ? "Today's Helper" : "Manual Dispatch Tools"}
        detail={mode === "ai" ? "Jarvis points out what needs a quick yes or no." : "Use these buttons when you want to handle the board yourself."}
      >
        {mode === "ai" ? (
          <div className="space-y-3">
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Today's quick look
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {criticalItems.length === 0
                  ? `${routeReadyCount} stops have a tech and address. About ${openSlots} openings may still be available.`
                  : `${criticalItems.length} scheduled job${criticalItems.length === 1 ? "" : "s"} still need a tech or arrival time.`}
              </p>
            </div>

            {firstCritical ? (
              <button
                type="button"
                onClick={() => onItemClick(firstCritical)}
                className="w-full rounded-md border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Fix this job
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {firstCritical.customer_name || "Unnamed job"} needs {!firstCritical.assigned_to ? "a technician" : "an arrival window"}.
                </p>
              </button>
            ) : (
              <div className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--complete-bg))] p-3 text-sm">
                No missing tech or arrival-window issues on this day.
              </div>
            )}

            {firstBacklog && (
              <button
                type="button"
                onClick={() => onItemClick(firstBacklog)}
                className="w-full rounded-md border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-primary" />
                  Schedule next backlog job
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {firstBacklog.customer_name || "Unscheduled work"} is ready to put on the board.
                </p>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => toast({ title: "Openings", description: `${openSlots} possible openings based on the active tech list.` })}>
              <Clock className="h-4 w-4" />
              Find opening
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => toast({ title: "Route check", description: `${routeReadyCount} stops have technician and address data.` })}>
              <Route className="h-4 w-4" />
              Check route
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => firstCritical ? onItemClick(firstCritical) : toast({ title: "Board looks good", description: "Every scheduled job has a tech and a time window." })}>
              <UserRound className="h-4 w-4" />
              Assign tech
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => firstBacklog ? onItemClick(firstBacklog) : toast({ title: "Backlog clear", description: "No unscheduled work in this filter." })}>
              <Plus className="h-4 w-4" />
              Place job
            </Button>
          </div>
        )}
      </RailSection>

      <RailSection title="Day Snapshot" detail="What today's board looks like at a glance.">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border bg-background p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Open slots</p>
            <p className="mt-1 text-xl font-semibold">{openSlots}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unassigned</p>
            <p className="mt-1 text-xl font-semibold">{unassigned.length}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Backlog</p>
            <p className="mt-1 text-xl font-semibold">{unscheduledItems.length}</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {criticalItems.slice(0, 3).map((item) => (
            <JobCard key={item.id} item={item} employees={employees} compact onClick={() => onItemClick(item)} />
          ))}
          {criticalItems.length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No jobs need fixing right now.</p>
          )}
        </div>

        <div className="mt-3 border-t pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">Schedule messages</p>
              <p className="text-[11px] text-muted-foreground">Only recent calls or texts that may affect today.</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => navigate("/intake")}>
              Intake HQ
            </Button>
          </div>
          {callsLoading || smsLoading ? (
            <Skeleton className="h-10 rounded-md" />
          ) : communicationItems.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No recent calls or texts.</p>
          ) : (
            <div className="space-y-1.5">
            {communicationItems.slice(0, 2).map((item) => {
              const visual = communicationVisual(item);
              const VisualIcon = visual.Icon;
              const DirectionIcon = visual.DirectionIcon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onCommunicationClick(item)}
                  aria-label={`Open ${visual.label} from ${item.name}`}
                  title={visual.label}
                  className="w-full rounded-md border bg-background px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md", visual.className)} role="img" aria-label={visual.label} title={visual.label}>
                        <VisualIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        <DirectionIcon className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-background bg-background p-0.5 text-foreground" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{item.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{item.summary}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="mr-1 text-[10px] text-muted-foreground">{item.time}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Call ${item.name}`}
                        title="Call back"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPhoneConsole(toE164(item.phone) || item.phone, { contactName: item.name });
                        }}
                      >
                        <Phone className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Text ${item.name}`}
                        title="Text customer"
                        onClick={(event) => {
                          event.stopPropagation();
                          openSmsComposer(toE164(item.phone) || item.phone, { contactName: item.name });
                        }}
                      >
                        <MessageSquare className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </button>
              );
            })}
            </div>
          )}
        </div>
      </RailSection>
    </aside>
  );
}

function CommunicationContextDialog({
  item,
  open,
  onOpenChange,
}: {
  item: CommunicationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  if (!item) return null;

  const isCall = item.kind === "call";
  const actionLabel = isCall ? "Open phone history" : "Text customer";
  const visual = communicationVisual(item);
  const VisualIcon = visual.Icon;
  const DirectionIcon = visual.DirectionIcon;
  const call = isCall ? (item.raw as CallConversation).lastCall : null;
  const sms = !isCall ? (item.raw as SmsConversation).lastMessage : null;
  const transcript = call?.transcription || null;
  const summary = call?.ai_summary || null;
  const messageBody = sms?.body || null;
  const smsMedia = normalizeMediaAttachments(sms?.media_urls);

  const callBack = () => {
    openPhoneConsole(toE164(item.phone) || item.phone, { contactName: item.name });
  };
  const textCustomer = () => {
    openSmsComposer(toE164(item.phone) || item.phone, { contactName: item.name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md", visual.className)} role="img" aria-label={visual.label} title={visual.label}>
              <VisualIcon className="h-4 w-4" aria-hidden="true" />
              <DirectionIcon className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border border-background bg-background p-0.5 text-foreground" aria-hidden="true" />
            </span>
            <DialogTitle>{item.name}</DialogTitle>
          </div>
          <DialogDescription>
            {formatPhone(item.phone) || item.phone} &middot; {item.time}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_240px]">
          <div className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What dispatch needs to know</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{item.summary}</p>
              <p className="mt-2 rounded-md bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
            </section>

            {summary && (
              <section className="rounded-lg border bg-card p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Jarvis summary</p>
                <p className="mt-2 text-sm leading-6 text-foreground">{summary}</p>
              </section>
            )}

            {(messageBody || smsMedia.length > 0) && (
              <section className="rounded-lg border bg-card p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Latest text</p>
                {messageBody && <p className="mt-2 text-sm leading-6 text-foreground">{messageBody}</p>}
                {smsMedia.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {smsMedia.map((media, index) => (
                      <MmsMediaRenderer
                        key={`${media.url}-${index}`}
                        url={media.url}
                        contentType={media.fileType || undefined}
                        fileName={media.fileName}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {transcript && (
              <section className="rounded-lg border bg-card p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Transcript</p>
                <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{transcript}</p>
              </section>
            )}
          </div>

          <aside className="space-y-3">
            <Button className="w-full justify-start gap-2" onClick={callBack}>
              <Phone className="h-4 w-4" />
              Call customer
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={textCustomer}>
              <MessageSquare className="h-4 w-4" />
              Text customer
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={isCall ? () => navigate("/phone") : textCustomer}>
              <ExternalLink className="h-4 w-4" />
              {actionLabel}
            </Button>
            {item.latestJobId && (
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate(`/jobs/${item.latestJobId}`)}>
                <CalendarDays className="h-4 w-4" />
                Open linked job
              </Button>
            )}
            <AskJarvisButton
              contextType={isCall ? "call" : "sms"}
              contextId={item.id}
              label="Ask Jarvis"
              variant="outline"
              className="w-full justify-start"
              stopPropagation={false}
              prompt={`Review this ${isCall ? "call" : "text"} from ${item.name}. Tell dispatch what the customer needs, whether it affects today's schedule, and the next action to approve.`}
              context={{
                title: `${isCall ? "Call" : "Text"} from ${item.name}`,
                customer_name: item.name,
                phone: item.phone,
                summary: item.summary,
                detail: item.detail,
                message_body: messageBody,
                transcript,
                ai_summary: summary,
                latest_job_id: item.latestJobId || null,
                suggested_actions: [
                  "Summarize what dispatch needs to know",
                  "Decide if this changes today's schedule",
                  "Draft the next customer or team message for approval",
                ],
              }}
            />
            <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
              This pop-up is the model: answer the call/text, understand intent, act on the board, then open the full record only when needed.
            </div>
          </aside>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={isCall ? () => navigate("/phone") : textCustomer}>{actionLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobContextDialog({
  item,
  employees,
  liveContext,
  open,
  onOpenChange,
  onOpenRecord,
  onOpenMedia,
}: {
  item: ScheduleItem | null;
  employees: any[];
  liveContext?: DispatchLiveCardContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRecord: (item: ScheduleItem) => void;
  onOpenMedia?: (item: ScheduleItem) => void;
}) {
  const navigate = useNavigate();
  const [sendingToNow, setSendingToNow] = useState(false);
  if (!item) return null;

  const status = item.status || item.work_status || "scheduled";
  const recordLabel = item.item_type === "estimate" ? "Open estimate" : "Open job";
  const dialableNumber = toE164(item.customer_phone) || item.customer_phone || "";
  const callFromBoard = () => {
    if (!dialableNumber) {
      toast({ title: "No phone number", description: "This record does not have a customer phone number yet." });
      return;
    }
    openPhoneConsole(dialableNumber, {
      contactName: item.customer_name || undefined,
      jobId: item.item_type === "job" ? item.id : undefined,
      customerId: item.customer_id || undefined,
    });
  };
  const textFromBoard = () => {
    if (!item.customer_phone) {
      toast({ title: "No phone number", description: "This record does not have a customer phone number yet." });
      return;
    }
    openSmsComposer(toE164(item.customer_phone) || item.customer_phone, {
      contactName: item.customer_name || undefined,
      jobId: item.item_type === "job" ? item.id : undefined,
      customerId: item.customer_id || undefined,
    });
  };
  const startQuickQuote = () => {
    navigate(buildQuickQuoteUrl(item));
  };
  const sendFieldContextToNow = async () => {
    if (!item || item.item_type !== "job") return;
    const summary = liveContext?.liveSummary || liveContext?.latestTechNote?.text || liveContext?.latestActivity?.details;
    if (!summary || summary === "Waiting for field updates.") {
      toast({ title: "No field update yet", description: "Jarvis is waiting for a tech note, checklist response, photo, or attachment before creating a Now card." });
      return;
    }

    setSendingToNow(true);
    try {
      const metadata = {
        job_id: item.id,
        job_number: item.job_number || item.hcp_job_number || null,
        customer_name: item.customer_name,
        customer_phone: item.customer_phone,
        address: item.address,
        latest_tech_note: liveContext?.latestTechNote || null,
        latest_activity: liveContext?.latestActivity || null,
        attachment_count: liveContext?.attachmentCount || 0,
        response_count: liveContext?.responseCount || 0,
        suggested_item_count: liveContext?.suggestedItemCount || 0,
        source_url: `/dispatch?job=${item.id}`,
        updated_from: "dispatch_live_card",
      };

      const { data: existing, error: existingError } = await supabase
        .from("action_items" as any)
        .select("id")
        .eq("source", "dispatch_live_cards")
        .eq("category", "tech_finding_review")
        .eq("status", "pending")
        .eq("job_id", item.id)
        .maybeSingle();
      if (existingError) throw existingError;

      if ((existing as any)?.id) {
        const { error } = await supabase
          .from("action_items" as any)
          .update({
            title: `Review field update: ${item.customer_name || "Job"}`,
            description: summary,
            suggested_action: "Review the latest tech note/photos, update the estimate or invoice, and keep the job moving.",
            customer_phone: item.customer_phone || null,
            metadata,
          })
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("action_items" as any)
          .insert({
            source: "dispatch_live_cards",
            category: "tech_finding_review",
            priority: liveContext?.liveTone === "attention" ? "high" : "normal",
            title: `Review field update: ${item.customer_name || "Job"}`,
            description: summary,
            suggested_action: "Review the latest tech note/photos, update the estimate or invoice, and keep the job moving.",
            job_id: item.id,
            customer_phone: item.customer_phone || null,
            metadata,
          });
        if (error) throw error;
      }

      toast({ title: "Sent to Now", description: "Dispatch and managers will see this field update as an action card." });
    } catch (error) {
      toast({
        title: "Could not send to Now",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingToNow(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{item.customer_name || "No customer name"}</DialogTitle>
            <Badge variant={item.assigned_to ? "secondary" : "destructive"}>
              {item.assigned_to ? "Assigned" : "Needs tech"}
            </Badge>
          </div>
          <DialogDescription>
            {item.job_number || item.hcp_job_number || item.id.slice(0, 8)} &middot; {buildTimeRange(item)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_240px]">
          <div className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Schedule details</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Technician</p>
                  <p className="text-sm font-semibold">{getEmployeeName(employees, item.assigned_to)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-sm font-semibold capitalize">{status.replaceAll("_", " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Arrival</p>
                  <p className="text-sm font-semibold">{buildTimeRange(item)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm font-semibold">{itemLabel(item)}</p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer and work</p>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{item.address || "No address on file"}</span>
                </div>
                <div className="flex gap-2">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{item.customer_phone || "No phone on this record"}</span>
                </div>
                <p className="rounded-md bg-muted/60 p-3 text-muted-foreground">
                  {item.description || "No job description yet. This is where dispatch notes, booking reason, and customer concerns should be visible."}
                </p>
              </div>
            </section>

            <section className={cn("rounded-lg border p-4", liveToneClass(liveContext))}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Latest field update</p>
                  <p className="mt-2 text-sm font-semibold">
                    {liveContext?.liveSummary || "No field updates yet."}
                  </p>
                </div>
                {liveContext?.latestTechNote?.createdAt && (
                  <Badge variant="outline" className="bg-background/70">
                    {relativeTime(liveContext.latestTechNote.createdAt)}
                  </Badge>
                )}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border bg-background/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Media</p>
                  <p className="mt-1 text-lg font-semibold">{liveContext?.attachmentCount || 0}</p>
                </div>
                <div className="rounded-md border bg-background/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Checklist</p>
                  <p className="mt-1 text-lg font-semibold">{liveContext?.responseCount || 0}</p>
                </div>
                <div className="rounded-md border bg-background/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Jarvis items</p>
                  <p className="mt-1 text-lg font-semibold">{liveContext?.suggestedItemCount || 0}</p>
                </div>
              </div>
              {liveContext?.latestTechNote?.text && (
                <div className="mt-3 rounded-md border bg-background/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Latest tech voice note</p>
                  <p className="mt-1 line-clamp-4 text-sm leading-6">{liveContext.latestTechNote.text}</p>
                </div>
              )}
              {liveContext?.latestActivity?.details && (
                <div className="mt-3 rounded-md border bg-background/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    Last action{liveContext.latestActivity.performedBy ? ` by ${liveContext.latestActivity.performedBy}` : ""}
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm leading-6">{liveContext.latestActivity.details}</p>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-3">
            <Button className="w-full justify-start gap-2" onClick={() => onOpenRecord(item)}>
              <ExternalLink className="h-4 w-4" />
              {recordLabel}
            </Button>
            <Button variant="secondary" className="w-full justify-start gap-2 border border-amber-500/30 bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 dark:text-amber-100" onClick={startQuickQuote}>
              <Zap className="h-4 w-4" />
              Build quote
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={callFromBoard}>
              <Phone className="h-4 w-4" />
              Call customer
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={textFromBoard}>
              <MessageSquare className="h-4 w-4" />
              Text customer
            </Button>
            {item.item_type === "job" && (
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => onOpenMedia?.(item)}>
                <Camera className="h-4 w-4" />
                Attachments / photos
              </Button>
            )}
            {item.item_type === "job" && (
              <Button variant="outline" className="w-full justify-start gap-2" disabled={sendingToNow} onClick={sendFieldContextToNow}>
                <Sparkles className="h-4 w-4" />
                Send field update to Now
              </Button>
            )}
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => toast({ title: "Route action", description: "Next pass can open map routing and fit-this-job suggestions." })}>
              <Navigation className="h-4 w-4" />
              Route / fit
            </Button>
            <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
              This pulls in the job record, tech notes, checklist answers, photos, and attachments so the office can see the latest without hunting around.
            </div>
          </aside>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => onOpenRecord(item)}>{recordLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobMediaDialog({
  item,
  open,
  onOpenChange,
}: {
  item: ScheduleItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item || item.item_type !== "job") return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Field media
          </DialogTitle>
          <DialogDescription>
            {item.customer_name || "No customer name"} &middot; {item.job_number || item.hcp_job_number || item.id.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto">
          <JobPhotosGrid jobId={item.id} />
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ScheduleV2() {
  const navigate = useNavigate();
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: estimates, isLoading: estimatesLoading } = useEstimates(true);
  const { data: employees = [] } = useEmployees();
  const { data: forecastMap } = useWeatherForecast();
  const techStatusMap = useTechStatusMap();
  const [currentDay, setCurrentDay] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [mode, setMode] = useState<DispatchMode>("ai");
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [selectedCommunication, setSelectedCommunication] = useState<CommunicationItem | null>(null);
  const [selectedMediaItem, setSelectedMediaItem] = useState<ScheduleItem | null>(null);

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const realJobHcpIds = new Set(
      (jobs || [])
        .filter((job: any) => job.hcp_id && job.job_type !== "estimate")
        .map((job: any) => job.hcp_id)
    );

    const jobItems = (jobs || []).map((job: any) => ({
      ...job,
      item_type: "job" as const,
      job_type: job.job_type || "service",
      job_number: job.job_number || job.hcp_job_number,
      arrival_start: job.arrival_start || null,
      arrival_end: job.arrival_end || null,
    }));

    const estimateItems = (estimates || [])
      .filter((estimate: any) => !estimate.hcp_id || !realJobHcpIds.has(estimate.hcp_id))
      .map((estimate: any) => ({
        ...estimate,
        item_type: "estimate" as const,
        job_type: "estimate",
        arrival_start: estimate.arrival_start || null,
        arrival_end: estimate.arrival_end || null,
      }));

    return [...jobItems, ...estimateItems];
  }, [jobs, estimates]);

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return scheduleItems.filter((item) => {
      const status = (item.status || item.work_status || "").toLowerCase();
      if (STATUS_DONE.has(status)) return false;
      if (filter === "estimate" && item.item_type !== "estimate") return false;
      if (filter !== "all" && filter !== "estimate" && (item.item_type === "estimate" || item.job_type !== filter)) return false;
      if (!search) return true;
      return [item.customer_name, item.address, item.description, item.job_number, item.hcp_job_number]
        .some((value) => String(value || "").toLowerCase().includes(search));
    });
  }, [scheduleItems, query, filter]);

  const dayItems = useMemo(() => {
    return filteredItems
      .filter((item) => item.scheduled_date && isSameDay(parseISO(item.scheduled_date), currentDay))
      .sort((a, b) => {
        if (a.arrival_start && b.arrival_start) return a.arrival_start.localeCompare(b.arrival_start);
        if (a.arrival_start) return -1;
        if (b.arrival_start) return 1;
        return (a.customer_name || "").localeCompare(b.customer_name || "");
      });
  }, [filteredItems, currentDay]);

  const unscheduledItems = useMemo(
    () => filteredItems.filter((item) => !item.scheduled_date).slice(0, 12),
    [filteredItems]
  );

  const activeTechNames = useMemo(
    () => (employees || []).filter((employee: any) => employee.is_active !== false).map((employee: any) => employee.name).filter(Boolean),
    [employees]
  );

  const groupedByTech = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    groups.set("Unassigned", []);

    for (const item of dayItems) {
      const name = getEmployeeName(employees, item.assigned_to);
      const key = groups.has(name) ? name : item.assigned_to ? name : "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(item);
    }

    return Array.from(groups.entries())
      .sort(([nameA, itemsA], [nameB, itemsB]) => {
        if (itemsA.length !== itemsB.length) return itemsB.length - itemsA.length;
        if (nameA === "Unassigned") return -1;
        if (nameB === "Unassigned") return 1;
        return nameA.localeCompare(nameB);
      })
      .filter(([, items]) => items.length > 0);
  }, [dayItems, employees]);

  const availableTechNames = useMemo(() => {
    const scheduledTechs = new Set(groupedByTech.filter(([name]) => name !== "Unassigned").map(([name]) => name));
    return activeTechNames.filter((name) => !scheduledTechs.has(name));
  }, [activeTechNames, groupedByTech]);

  const weekDays = eachDayOfInterval({
    start: startOfWeek(currentDay, { weekStartsOn: 0 }),
    end: endOfWeek(currentDay, { weekStartsOn: 0 }),
  });
  const currentDayKey = format(currentDay, "yyyy-MM-dd");
  const dayForecast = forecastMap?.get(currentDayKey);

  const criticalItems = dayItems.filter((item) => !item.assigned_to || !item.arrival_start);
  const routeReadyCount = dayItems.filter((item) => item.assigned_to && item.address).length;
  const backlogPreview = unscheduledItems.slice(0, 8).map((item) => ({
    id: item.id,
    type: item.item_type === "estimate" ? "estimate" : item.job_type,
    customer_name: item.customer_name,
    address: item.address,
    description: item.description,
    phone: item.customer_phone,
  }));
  const loading = jobsLoading || estimatesLoading;
  const dispatchLiveJobIds = useMemo(
    () => filteredItems.filter((item) => item.item_type === "job").map((item) => item.id).slice(0, 200),
    [filteredItems]
  );
  const { data: dispatchLiveCards = new Map<string, DispatchLiveCardContext>() } = useDispatchLiveCards(dispatchLiveJobIds);

  const getLiveContext = (item: ScheduleItem) => item.item_type === "job" ? dispatchLiveCards.get(item.id) : undefined;
  const getTechStatus = (item: ScheduleItem) => {
    const employeeId = getEmployeeId(employees, item.assigned_to);
    return employeeId ? techStatusMap.get(employeeId) || null : null;
  };

  const openItem = (item: ScheduleItem) => {
    setSelectedItem(item);
  };

  const openRecord = (item: ScheduleItem) => {
    navigate(item.item_type === "estimate" ? `/estimates/${item.id}` : `/jobs/${item.id}`);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search dispatch"
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Dispatch HQ</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep today's jobs, techs, addresses, and approvals in one place before trucks roll.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border bg-background p-1">
                <Button
                  type="button"
                  variant={mode === "ai" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 gap-2"
                  onClick={() => setMode("ai")}
                >
                  <Sparkles className="h-4 w-4" />
                  AI
                </Button>
                <Button
                  type="button"
                  variant={mode === "human" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 gap-2"
                  onClick={() => setMode("human")}
                >
                  <UserRound className="h-4 w-4" />
                  Human
                </Button>
              </div>
              <Button
                variant="default"
                size="icon"
                className="h-9 w-9"
                aria-label="Open full calendar"
                title="Open full calendar"
                onClick={() => navigate(`/dispatch/calendar?date=${format(currentDay, "yyyy-MM-dd")}`)}
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/intake")}>
                Intake HQ
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Previous day" title="Previous day" onClick={() => setCurrentDay(subDays(currentDay, 1))}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDay(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Next day" title="Next day" onClick={() => setCurrentDay(addDays(currentDay, 1))}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="flex items-center gap-1 overflow-x-auto rounded-md border bg-background p-1">
              <Filter className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
              {FILTERS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={filter === option.value ? "default" : "ghost"}
                  size="sm"
                  className="h-8 whitespace-nowrap"
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 border-b bg-muted/30 p-4 lg:grid-cols-4">
          <MetricCard
            label="Date"
            value={format(currentDay, "EEE, MMM d")}
            detail={dayForecast ? (
              <WeatherBadge forecast={dayForecast} className="-ml-1 !px-0" />
            ) : (
              isToday(currentDay) ? "Today" : format(currentDay, "EEEE")
            )}
            icon={CalendarDays}
          />
          <MetricCard label="Stops" value={dayItems.length} detail={`${routeReadyCount} have a tech and address`} icon={Route} />
          <MetricCard label="Needs Fix" value={criticalItems.length} detail="Missing a tech or arrival time" icon={AlertTriangle} />
          <MetricCard
            label="Backlog"
            value={unscheduledItems.length}
            detail="Waiting to be scheduled"
            icon={Sparkles}
            action={unscheduledItems.length > 0 ? (
              <AskJarvisButton
                contextType="dispatch_card"
                contextId={`dispatch-backlog-${currentDayKey}`}
                label="Ask Jarvis"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-[11px]"
                stopPropagation={false}
                prompt={`Look at the dispatch backlog for ${format(currentDay, "EEEE, MMMM d")}. Tell me which unscheduled job should be placed next, what info is missing, and the safest next step for dispatch.`}
                context={{
                  title: `Dispatch backlog for ${format(currentDay, "EEEE, MMMM d")}`,
                  selected_date: currentDayKey,
                  backlog_count: unscheduledItems.length,
                  open_slots: Math.max(0, (employees || []).filter((employee: any) => employee.is_active !== false).length * 3 - dayItems.length),
                  day_job_count: dayItems.length,
                  route_ready_count: routeReadyCount,
                  missing_schedule_count: criticalItems.length,
                  backlog_preview: backlogPreview,
                  suggested_actions: [
                    "Pick the best backlog job to schedule next",
                    "List any missing customer, address, or timing information",
                    "Draft the dispatcher's next step for approval",
                  ],
                }}
              />
            ) : undefined}
          />
        </div>

        <Tabs defaultValue="board" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b bg-card px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="h-10">
                <TabsTrigger value="board" className="gap-2"><Users className="h-4 w-4" /> Board</TabsTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-3"
                  onClick={() => navigate(`/dispatch/calendar?date=${format(currentDay, "yyyy-MM-dd")}`)}
                >
                  <CalendarDays className="h-4 w-4" />
                  Calendar
                </Button>
                <TabsTrigger value="route" className="gap-2"><Route className="h-4 w-4" /> Route</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-1 overflow-x-auto">
                {weekDays.map((day) => {
                  const active = isSameDay(day, currentDay);
                  const count = filteredItems.filter((item) => item.scheduled_date && isSameDay(parseISO(item.scheduled_date), day)).length;
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setCurrentDay(day)}
                      className={cn(
                        "flex h-10 min-w-16 flex-col items-center justify-center rounded-md border px-3 text-xs transition",
                        active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <span className="font-semibold">{format(day, "EEE d")}</span>
                      <span className={cn("text-[10px]", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{count} jobs</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid flex-1 gap-3 overflow-hidden p-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-full min-h-96 rounded-lg" />)}
            </div>
          ) : (
            <>
              <TabsContent value="board" className="m-0 min-h-0 flex-1 overflow-auto p-4">
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-foreground">Day Board</h2>
                  <p className="text-xs text-muted-foreground">
                    {mode === "ai"
                      ? "Jarvis points out schedule problems; dispatch approves the fix."
                      : "Assign techs, schedule backlog, and contact customers by hand."}
                  </p>
                </div>
                <div className="grid min-w-[1320px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-4">
                    {groupedByTech.length === 0 ? (
                      <section className="rounded-lg border border-dashed bg-card p-6 text-center shadow-sm">
                        <p className="text-sm font-semibold text-foreground">No scheduled jobs on this day</p>
                        <p className="mt-1 text-xs text-muted-foreground">Use Intake HQ or backlog to put work on the board.</p>
                      </section>
                    ) : groupedByTech.map(([techName, items]) => (
                      <section key={techName} className="flex min-h-0 flex-col rounded-lg border bg-card shadow-sm">
                        <div className="border-b px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-sm font-semibold">{techName}</h3>
                            <Badge variant={techName === "Unassigned" ? "destructive" : "secondary"}>{items.length}</Badge>
                          </div>
                        </div>
                        <div className="max-h-[560px] space-y-2 overflow-y-auto p-2">
                          {items.map((item) => (
                              <JobCard
                                key={item.id}
                                item={item}
                                employees={employees}
                                liveContext={getLiveContext(item)}
                                techStatus={getTechStatus(item)}
                                onClick={() => openItem(item)}
                                onOpenMedia={() => setSelectedMediaItem(item)}
                              />
                          ))}
                        </div>
                      </section>
                    ))}
                    </div>

                    {availableTechNames.length > 0 && (
                      <section className="rounded-lg border bg-card px-3 py-2 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">Available techs</span>
                          {availableTechNames.map((name) => (
                            <Badge key={name} variant="outline" className="rounded-md">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                  <BoardCommandRail
                    mode={mode}
                    criticalItems={criticalItems}
                    unscheduledItems={unscheduledItems}
                    dayItems={dayItems}
                    routeReadyCount={routeReadyCount}
                    employees={employees}
                    onItemClick={openItem}
                    onCommunicationClick={setSelectedCommunication}
                  />
                </div>
              </TabsContent>

              <TabsContent value="route" className="m-0 min-h-0 flex-1 overflow-auto p-4">
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-foreground">Route View</h2>
                  <p className="text-xs text-muted-foreground">See the day's stops, travel order, and anything that may slow the route down.</p>
                </div>
                <div className="grid min-h-[620px] gap-4 lg:grid-cols-[360px_1fr_340px]">
                  <section className="rounded-lg border bg-card shadow-sm">
                    <div className="border-b px-4 py-3">
                      <h3 className="text-sm font-semibold">Stops</h3>
                      <p className="text-xs text-muted-foreground">Ordered by arrival window</p>
                    </div>
                    <div className="space-y-2 p-3">
                      {dayItems.map((item, index) => (
                        <div key={item.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                              {index + 1}
                            </div>
                            {index < dayItems.length - 1 && <div className="h-10 w-px bg-border" />}
                          </div>
                          <div className="min-w-0 flex-1 pb-2">
                            <JobCard
                              item={item}
                              employees={employees}
                              liveContext={getLiveContext(item)}
                              techStatus={getTechStatus(item)}
                              compact
                              onClick={() => openItem(item)}
                              onOpenMedia={() => setSelectedMediaItem(item)}
                            />
                          </div>
                        </div>
                      ))}
                      {dayItems.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No scheduled stops today.</p>}
                    </div>
                  </section>

                  <section className="relative overflow-hidden rounded-lg border bg-card shadow-sm">
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px),linear-gradient(hsl(var(--border))_1px,transparent_1px)] bg-[size:36px_36px] opacity-35" />
                    <div className="relative flex h-full min-h-[620px] flex-col">
                      <div className="border-b bg-card/90 px-4 py-3 backdrop-blur">
                        <h3 className="text-sm font-semibold">Map Overview</h3>
                        <p className="text-xs text-muted-foreground">A quick look at where the day is spread out.</p>
                      </div>
                      <div className="relative flex-1">
                        {dayItems.slice(0, 8).map((item, index) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openItem(item)}
                            className="absolute flex max-w-[220px] items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left shadow-md"
                            style={{
                              left: `${12 + (index % 4) * 21}%`,
                              top: `${16 + Math.floor(index / 4) * 34 + (index % 2) * 7}%`,
                            }}
                          >
                            <MapPin className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate text-xs font-semibold">{item.customer_name || "Stop"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border bg-card shadow-sm">
                    <div className="border-b px-4 py-3">
                      <h3 className="text-sm font-semibold">Route Check</h3>
                      <p className="text-xs text-muted-foreground">Anything to fix before techs head out.</p>
                    </div>
                    <div className="space-y-3 p-3">
                      {criticalItems.length === 0 ? (
                        <div className="rounded-lg border border-[hsl(var(--success))]/30 bg-[hsl(var(--complete-bg))] p-3 text-sm">
                          The selected day looks ready to run.
                        </div>
                      ) : (
                        criticalItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openItem(item)}
                            className="w-full rounded-lg border bg-background p-3 text-left hover:border-primary/40"
                          >
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                              {item.customer_name || "Unnamed job"}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {!item.assigned_to ? "Needs technician" : "Needs arrival window"}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>

      <JobContextDialog
        item={selectedItem}
        employees={employees}
        liveContext={selectedItem ? getLiveContext(selectedItem) : undefined}
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
        onOpenRecord={openRecord}
        onOpenMedia={(item) => setSelectedMediaItem(item)}
      />
      <JobMediaDialog
        item={selectedMediaItem}
        open={!!selectedMediaItem}
        onOpenChange={(open) => {
          if (!open) setSelectedMediaItem(null);
        }}
      />
      <CommunicationContextDialog
        item={selectedCommunication}
        open={!!selectedCommunication}
        onOpenChange={(open) => {
          if (!open) setSelectedCommunication(null);
        }}
      />
    </div>
  );
}
