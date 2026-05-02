/**
 * TechJobDetail.tsx - mobile technician job screen.
 *
 * Primary flow: destination first, status controls at the house, then JARVIS
 * diagnosis/estimate drafting, then photos and supporting details.
 */

import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ImagePlus,
  MapPin,
  MessageSquare,
  Mic,
  Navigation,
  Phone,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TechAttachmentsCard } from "@/components/tech/TechAttachmentsCard";
import { TechCollapsibleCard } from "@/components/tech/TechCollapsibleCard";
import { TechJarvisPushToTalk } from "@/components/tech/TechJarvisPushToTalk";
import { TechScheduleCard } from "@/components/tech/TechScheduleCard";
import { TechStatusCard } from "@/components/tech/TechStatusCard";
import { StreetViewThumbnail } from "@/components/tech/StreetViewThumbnail";
import { useTechWorkSummary, type TechWorkSummaryRow } from "@/hooks/useCanonicalOperations";
import { useCustomer } from "@/hooks/useCustomers";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useJob } from "@/hooks/useJobs";
import { GOOGLE_MAPS_API_KEY } from "@/lib/google-maps";
import { errorMessage } from "@/lib/errorMessage";
import { launchNavigation } from "@/lib/launchNavigation";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { cn } from "@/lib/utils";

function cleanLabel(value?: string | null) {
  return value ? value.replace(/_/g, " ") : "";
}

function statusLabel(job: any) {
  return cleanLabel(job?.status || "new").toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatSchedule(scheduledDate?: string | null, arrivalStart?: string | null, arrivalEnd?: string | null) {
  const date = formatDate(scheduledDate);
  const start = formatTime(arrivalStart);
  const end = formatTime(arrivalEnd);
  if (start && end) return `${date}, ${start} - ${end}`;
  if (start) return `${date}, ${start}`;
  return date;
}

function jobProblem(job: any) {
  return (
    (job?.description && String(job.description).trim()) ||
    (job?.hcp_note && String(job.hcp_note).trim()) ||
    "No notes yet."
  );
}

export default function TechJobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { employeeId } = useEffectiveAuth();
  const { data: job, isLoading, isError, error: jobQueryError } = useJob(id!);
  const { data: linkedCustomer, isError: customerError, error: customerQueryError } = useCustomer(job?.customer_id || undefined);
  const { data: techWorkRows = [], isError: techWorkError, error: techWorkQueryError } = useTechWorkSummary(id ? [id] : []);
  const techWork = techWorkRows[0] || null;

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/20 p-3">
        <Skeleton className="mb-3 h-12 w-full rounded-lg" />
        <Skeleton className="mb-3 h-72 w-full rounded-lg" />
        <Skeleton className="mb-3 h-40 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <TechHeader title="Job not found" subtitle="This job link is no longer available." onBack={() => navigate(-1)} />
        <main className="px-6 py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <h1 className="text-lg font-semibold">Job not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {jobQueryError ? errorMessage(jobQueryError) : "This job may have been deleted, moved, or the link is invalid."}
          </p>
        </main>
      </div>
    );
  }

  const customerName =
    job.customer_name ||
    [linkedCustomer?.first_name, linkedCustomer?.last_name].filter(Boolean).join(" ") ||
    linkedCustomer?.company ||
    "Unknown customer";
  const customerPhone = job.customer_phone || linkedCustomer?.phone || linkedCustomer?.mobile_phone || null;
  const customerEmail = job.customer_email || linkedCustomer?.email || null;
  const customerAddress =
    job.address ||
    [linkedCustomer?.address, linkedCustomer?.city, linkedCustomer?.state, linkedCustomer?.zip].filter(Boolean).join(", ") ||
    null;
  const jobNumber = job.job_number || job.hcp_job_number || "-";
  const employeeName = job.assigned_to || null;
  const arrivalStart = (job as any).arrival_start || null;
  const arrivalEnd = (job as any).arrival_end || null;
  const schedule = formatSchedule(job.scheduled_date || null, arrivalStart, arrivalEnd);
  const problemSummary = jobProblem(job);
  const contextIssues = [
    customerError ? `customer details (${errorMessage(customerQueryError)})` : null,
    techWorkError ? `field-work summary (${errorMessage(techWorkQueryError)})` : null,
  ].filter(Boolean);

  const openSms = () => {
    if (!customerPhone) return;
    openSmsComposer(customerPhone, {
      contactName: customerName,
      jobId: id,
      customerId: job.customer_id || undefined,
    });
  };

  const callCustomer = () => {
    if (!customerPhone) return;
    openPhoneConsole(customerPhone);
  };

  const openNavigation = () => {
    if (!customerAddress) return;
    launchNavigation(customerAddress);
  };

  return (
    <div className="min-h-screen bg-muted/20 pb-6">
      <TechHeader
        title={customerName}
        subtitle={`Job ${jobNumber} - ${statusLabel(job)}`}
        onBack={() => navigate(-1)}
      />

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pt-3">
        {contextIssues.length > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Some job context did not load.</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Missing {contextIssues.join(", ")}. Refresh before writing up the final diagnosis or proposal.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <section className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <DestinationCard
            customerName={customerName}
            customerPhone={customerPhone}
            customerEmail={customerEmail}
            customerAddress={customerAddress}
            schedule={schedule}
            assignedTo={employeeName}
            status={statusLabel(job)}
            onNavigate={openNavigation}
            onCall={callCustomer}
            onSms={openSms}
          />
        </section>

        <div id="tech-status" className="scroll-mt-16">
          <TechStatusCard
            jobId={id!}
            status={job.status || "new"}
            onMyWaySentAt={(job as any).on_my_way_sent_at || null}
            startedAt={(job as any).started_at || null}
            completedAt={(job as any).completed_at || null}
            pausedAt={(job as any).paused_at || null}
            description={job.description || null}
            hcpNote={(job as any).hcp_note || null}
            customerPhone={customerPhone}
            customerName={customerName}
            jobAddress={customerAddress}
            employeeName={employeeName}
            employeeId={employeeId || null}
          />
        </div>

        <TechNowCard
          onMyWaySentAt={(job as any).on_my_way_sent_at || null}
          startedAt={(job as any).started_at || null}
          completedAt={(job as any).completed_at || null}
          isFinished={["done", "invoiced"].includes(String(job.status || "").toLowerCase())}
          techWork={techWork}
          onOpenStatus={() => scrollToSection("tech-status")}
          onOpenPhotos={() => scrollToSection("tech-findings")}
          onOpenJarvis={() => scrollToSection("tech-jarvis")}
          onOpenCart={() => navigate(`/tech/jobs/${id}/cart`)}
        />

        <TechCollapsibleCard
          icon={Mic}
          title="Jarvis"
          iconBg="bg-purple-500/10"
          iconColor="text-purple-500"
          collapsible={false}
          id="tech-jarvis"
          className="scroll-mt-16"
        >
          <TechJarvisPushToTalk
            jobId={id!}
            jobNumber={jobNumber}
            customerName={customerName}
            bare
            onOpenPhotos={() => scrollToSection("tech-findings")}
            onOpenCart={() => navigate(`/tech/jobs/${id}/cart`)}
            enableProposalActions
          />
        </TechCollapsibleCard>

        <TechCollapsibleCard icon={FileText} title="Notes" iconBg="bg-amber-500/10" iconColor="text-amber-600" collapsible={false}>
          <div className="space-y-3 p-4">
            <InfoBlock label="Customer" value={problemSummary} />
            <div className="grid grid-cols-2 gap-2">
              <FieldTile icon={Wrench} label="Type" value={cleanLabel(job.job_type || "Service")} />
              <FieldTile icon={CheckCircle2} label="Goal" value="Customer approval" />
            </div>
          </div>
        </TechCollapsibleCard>

        <TechCollapsibleCard
          icon={ImagePlus}
          title="Findings + Photos"
          iconBg="bg-rose-500/10"
          iconColor="text-rose-500"
          collapsible={false}
          id="tech-findings"
          className="scroll-mt-16"
        >
          <TechAttachmentsCard
            jobId={id!}
            hcpId={(job as any).hcp_id || null}
            customerPhone={customerPhone}
            jobNumber={jobNumber}
            techName={job.assigned_to || null}
            bare
          />
        </TechCollapsibleCard>

        <TechCollapsibleCard icon={CalendarClock} title="Schedule" iconBg="bg-indigo-500/10" iconColor="text-indigo-500" defaultOpen={false}>
          <TechScheduleCard
            jobId={id!}
            jobNumber={jobNumber}
            scheduledDate={job.scheduled_date || null}
            arrivalStart={arrivalStart}
            arrivalEnd={arrivalEnd}
            assignedTo={job.assigned_to || null}
            bare
          />
        </TechCollapsibleCard>
      </main>
    </div>
  );
}

function TechHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-background/95 px-2 backdrop-blur">
      <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onBack} aria-label="Back">
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{subtitle}</p>
      </div>
      <div className="w-10" />
    </header>
  );
}

function DestinationCard({
  customerName,
  customerPhone,
  customerEmail,
  customerAddress,
  schedule,
  assignedTo,
  status,
  onNavigate,
  onCall,
  onSms,
}: {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  schedule: string;
  assignedTo: string | null;
  status: string;
  onNavigate: () => void;
  onCall: () => void;
  onSms: () => void;
}) {
  return (
    <div className="border-b bg-card">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-foreground">{customerName}</h1>
            <div className="mt-2 space-y-1 text-sm leading-snug text-muted-foreground">
              <p className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{customerAddress || "No address on file"}</span>
              </p>
              <p className="flex gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{schedule}{assignedTo ? ` - ${assignedTo}` : ""}</span>
              </p>
              {customerPhone && <p>{customerPhone}</p>}
              {customerEmail && <p className="truncate">{customerEmail}</p>}
            </div>
          </div>
          <Badge className="shrink-0 rounded-sm">{status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-[1.15fr_0.85fr] gap-2 px-4 pb-4">
        <TownMapPreview address={customerAddress} />
        <StreetViewThumbnail address={customerAddress} aspect="square" className="min-h-[150px]" />
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <Button className="h-12 gap-2" onClick={onNavigate} disabled={!customerAddress}>
          <Navigation className="h-4 w-4" />
          Navigate
        </Button>
        <Button variant="outline" className="h-12 gap-2" onClick={onCall} disabled={!customerPhone}>
          <Phone className="h-4 w-4" />
          Call
        </Button>
        <Button variant="outline" className="h-12 gap-2" onClick={onSms} disabled={!customerPhone}>
          <MessageSquare className="h-4 w-4" />
          Text
        </Button>
      </div>
    </div>
  );
}

function TechNowCard({
  onMyWaySentAt,
  startedAt,
  completedAt,
  isFinished,
  techWork,
  onOpenStatus,
  onOpenPhotos,
  onOpenJarvis,
  onOpenCart,
}: {
  onMyWaySentAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  isFinished: boolean;
  techWork: TechWorkSummaryRow | null;
  onOpenStatus: () => void;
  onOpenPhotos: () => void;
  onOpenJarvis: () => void;
  onOpenCart: () => void;
}) {
  const hasPhotos = Number(techWork?.attachment_count || 0) > 0 || Boolean(techWork?.photos_uploaded_at);
  const hasEstimate = Number(techWork?.estimate_count || 0) > 0 || Boolean(techWork?.latest_estimate_at);
  const nextStep = techWork?.tech_next_step || null;
  const attachmentCount = Number(techWork?.attachment_count || 0);
  const estimateCount = Number(techWork?.estimate_count || 0);
  const completed = Boolean(completedAt) || isFinished;

  const primaryAction = (() => {
    if (completed) {
      return {
        title: "Finished",
        detail: actionTime(completedAt) || "Done",
        icon: CheckCircle2,
        onClick: onOpenStatus,
        tone: "done" as const,
      };
    }
    if (!onMyWaySentAt) {
      return {
        title: "On My Way",
        detail: "Send ETA",
        icon: Navigation,
        onClick: onOpenStatus,
        tone: "urgent" as const,
      };
    }
    if (!startedAt) {
      return {
        title: "Arrive",
        detail: "Start job",
        icon: MapPin,
        onClick: onOpenStatus,
        tone: "urgent" as const,
      };
    }
    if (!hasPhotos) {
      return {
        title: "Photos",
        detail: "Add first set",
        icon: ImagePlus,
        onClick: onOpenPhotos,
        tone: "normal" as const,
      };
    }
    if (!nextStep) {
      return {
        title: "Jarvis",
        detail: "Findings",
        icon: Mic,
        onClick: onOpenJarvis,
        tone: "normal" as const,
      };
    }
    if (!hasEstimate) {
      return {
        title: "Quote",
        detail: nextStep,
        icon: Wrench,
        onClick: onOpenCart,
        tone: "normal" as const,
      };
    }
    return {
      title: "Wrap Up",
      detail: "Photos, quote, finish",
      icon: ClipboardCheck,
      onClick: onOpenPhotos,
      tone: "normal" as const,
    };
  })();
  const PrimaryIcon = primaryAction.icon;
  const etaSentAt = actionTime(onMyWaySentAt);

  return (
    <section className="rounded-lg border bg-background shadow-sm">
      <button
        type="button"
        onClick={primaryAction.onClick}
        className={cn(
          "flex w-full items-start gap-3 p-4 text-left transition active:scale-[0.99]",
          primaryAction.tone === "done" ? "bg-emerald-500/10" : "bg-primary/5",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
            primaryAction.tone === "done" ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground",
          )}
        >
          <PrimaryIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next</p>
            {etaSentAt ? (
              <Badge variant="outline" className="rounded-sm text-[10px]">
                {etaSentAt}
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-1 text-lg font-bold leading-tight text-foreground">{primaryAction.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{primaryAction.detail}</p>
        </div>
      </button>

      <div className="grid grid-cols-3 gap-2 border-t p-3">
        <MiniActionButton icon={Mic} label="Jarvis" onClick={onOpenJarvis} />
        <MiniActionButton icon={ImagePlus} label="Photos" count={attachmentCount} onClick={onOpenPhotos} />
        <MiniActionButton icon={Wrench} label="Quote" count={estimateCount} onClick={onOpenCart} />
      </div>
    </section>
  );
}

function actionTime(timestamp?: string | null) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function MiniActionButton({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-muted/30 active:scale-[0.98]"
    >
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-5 w-5 text-primary" />
        {typeof count === "number" ? <span className="text-xs font-bold text-muted-foreground">{count}</span> : null}
      </div>
      <p className="mt-2 text-sm font-semibold leading-tight text-foreground">{label}</p>
    </button>
  );
}

function TownMapPreview({ address }: { address: string | null }) {
  if (!address || !GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex min-h-[150px] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        <MapPin className="h-6 w-6 opacity-50" />
      </div>
    );
  }

  const encoded = encodeURIComponent(address);
  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encoded}&zoom=12&size=420x420&maptype=roadmap&markers=color:red%7C${encoded}&key=${GOOGLE_MAPS_API_KEY}`;
  return (
    <button
      type="button"
      onClick={() => launchNavigation(address)}
      className="relative min-h-[150px] overflow-hidden rounded-lg border bg-muted"
      aria-label="Open map"
    >
      <img src={mapUrl} alt={`Map near ${address}`} className="h-full w-full object-cover" loading="lazy" />
      <div className="absolute bottom-2 left-2 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm">
        Area map
      </div>
    </button>
  );
}

function FieldTile({
  icon: Icon,
  label,
  value,
  detail,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border bg-background p-3 shadow-sm", className)}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{value}</p>
      {detail ? <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  );
}
