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
  SendHorizontal,
  Sparkles,
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
    "Review the concern, document the diagnosis, and talk through the next step with the customer."
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message?: unknown }).message || "Unknown error");
  return "Unknown error";
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

        <UniversalTechFlow
          onMyWaySentAt={(job as any).on_my_way_sent_at || null}
          startedAt={(job as any).started_at || null}
          completedAt={(job as any).completed_at || null}
          techWork={techWork}
          onOpenStatus={() => scrollToSection("tech-status")}
          onOpenPhotos={() => scrollToSection("tech-findings")}
          onOpenJarvis={() => scrollToSection("tech-jarvis")}
          onOpenCart={() => navigate(`/tech/jobs/${id}/cart`)}
        />

        <TechWorkBrief techWork={techWork} onOpenPhotos={() => scrollToSection("tech-findings")} onOpenCart={() => navigate(`/tech/jobs/${id}/cart`)} />

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

        <TechCollapsibleCard
          icon={Mic}
          title="JARVIS Diagnosis + Estimate Draft"
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

        <TechCollapsibleCard icon={FileText} title="Job Brief" iconBg="bg-amber-500/10" iconColor="text-amber-600" collapsible={false}>
          <div className="space-y-3 p-4">
            <InfoBlock label="Customer concern" value={problemSummary} />
            <div className="grid grid-cols-2 gap-2">
              <FieldTile icon={Wrench} label="Type" value={cleanLabel(job.job_type || "Service")} detail="Confirm repair or estimate path." />
              <FieldTile icon={CheckCircle2} label="Goal" value="Approval-ready estimate" detail="JARVIS drafts line items; tech reviews before SMS." />
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

        <section className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-foreground">Ready to send for approval?</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                JARVIS can draft estimate line items from the diagnosis. Review the proposal before sending an approval link to the customer.
              </p>
              <Button className="mt-3 w-full gap-2" onClick={() => navigate(`/tech/jobs/${id}/cart`)}>
                Open proposal workspace
              </Button>
            </div>
          </div>
        </section>
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
            <Badge variant="outline" className="mb-2 rounded-sm bg-background text-[10px]">
              Destination
            </Badge>
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

function UniversalTechFlow({
  onMyWaySentAt,
  startedAt,
  completedAt,
  techWork,
  onOpenStatus,
  onOpenPhotos,
  onOpenJarvis,
  onOpenCart,
}: {
  onMyWaySentAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  techWork: TechWorkSummaryRow | null;
  onOpenStatus: () => void;
  onOpenPhotos: () => void;
  onOpenJarvis: () => void;
  onOpenCart: () => void;
}) {
  const hasPhotos = Number(techWork?.attachment_count || 0) > 0 || Boolean(techWork?.photos_uploaded_at);
  const hasEstimate = Number(techWork?.estimate_count || 0) > 0 || Boolean(techWork?.latest_estimate_at);
  const nextStep = techWork?.tech_next_step || null;
  const actions = [
    {
      title: "On My Way",
      detail: actionTime(onMyWaySentAt) || "Send ETA text",
      icon: Navigation,
      done: Boolean(onMyWaySentAt),
      onClick: onOpenStatus,
    },
    {
      title: "Arrive",
      detail: actionTime(startedAt) || "Start job timer",
      icon: MapPin,
      done: Boolean(startedAt),
      onClick: onOpenStatus,
    },
    {
      title: "Snap Photos",
      detail: hasPhotos ? `${techWork?.attachment_count || 1} file${Number(techWork?.attachment_count || 1) === 1 ? "" : "s"} saved` : "Unit, plate, readings",
      icon: ImagePlus,
      done: hasPhotos,
      onClick: onOpenPhotos,
    },
    {
      title: "Voice Memo",
      detail: "Hold mic and talk",
      icon: Mic,
      done: false,
      onClick: onOpenJarvis,
    },
    {
      title: "AI Review",
      detail: nextStep || "Jarvis drafts diagnosis",
      icon: Sparkles,
      done: Boolean(nextStep && nextStep !== "Send ETA and start travel."),
      onClick: onOpenJarvis,
    },
    {
      title: "Add Parts",
      detail: hasEstimate ? `${techWork?.estimate_count || 1} estimate${Number(techWork?.estimate_count || 1) === 1 ? "" : "s"} started` : "Build estimate items",
      icon: Wrench,
      done: hasEstimate,
      onClick: onOpenCart,
    },
    {
      title: "After Photos",
      detail: "Final proof shots",
      icon: ClipboardCheck,
      done: false,
      onClick: onOpenPhotos,
    },
    {
      title: "Submit",
      detail: actionTime(completedAt) || "Finish and notify",
      icon: SendHorizontal,
      done: Boolean(completedAt),
      onClick: onOpenStatus,
    },
  ];

  return (
    <section className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Universal Tech Flow</h2>
          <p className="text-xs text-muted-foreground">One pass through the job, top to bottom.</p>
        </div>
        <Badge variant="outline" className="shrink-0 rounded-sm text-[10px]">
          Field
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <FlowActionCard key={action.title} {...action} />
        ))}
      </div>
    </section>
  );
}

function TechWorkBrief({
  techWork,
  onOpenPhotos,
  onOpenCart,
}: {
  techWork: TechWorkSummaryRow | null;
  onOpenPhotos: () => void;
  onOpenCart: () => void;
}) {
  const nextStep = techWork?.tech_next_step || "Follow the tech flow from left to right.";
  const attachmentCount = Number(techWork?.attachment_count || 0);
  const estimateCount = Number(techWork?.estimate_count || 0);

  return (
    <section className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Shared job signal</h2>
            <Badge variant="outline" className="rounded-sm text-[10px]">
              Office sees this too
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{nextStep}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenPhotos}
              className="rounded-md border bg-muted/30 p-3 text-left transition hover:bg-muted/60"
            >
              <p className="text-lg font-bold text-foreground">{attachmentCount}</p>
              <p className="text-xs text-muted-foreground">photos and files</p>
            </button>
            <button
              type="button"
              onClick={onOpenCart}
              className="rounded-md border bg-muted/30 p-3 text-left transition hover:bg-muted/60"
            >
              <p className="text-lg font-bold text-foreground">{estimateCount}</p>
              <p className="text-xs text-muted-foreground">quotes started</p>
            </button>
          </div>
        </div>
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

function FlowActionCard({
  title,
  detail,
  icon: Icon,
  done,
  onClick,
}: {
  title: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[92px] rounded-lg border bg-card p-3 text-left shadow-sm transition active:scale-[0.98]",
        done ? "border-emerald-500/40 bg-emerald-500/5" : "hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            done ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary",
          )}
        >
          {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-tight text-foreground">{title}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{detail}</p>
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
  detail: string;
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
      <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{detail}</p>
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
