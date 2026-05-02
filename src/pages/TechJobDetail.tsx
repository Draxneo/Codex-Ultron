/**
 * TechJobDetail.tsx - mobile technician job screen.
 *
 * Primary flow: destination first, status controls at the house, then JARVIS
 * diagnosis/estimate drafting, then photos and supporting details.
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CloudSun,
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
import { TechWeatherCard } from "@/components/tech/TechWeatherCard";
import { StreetViewThumbnail } from "@/components/tech/StreetViewThumbnail";
import { useTechWorkSummary } from "@/hooks/useCanonicalOperations";
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
  const [manualStage, setManualStage] = useState<TechStage | null>(null);

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
  const problemSummary = jobProblem(job);
  const onMyWaySentAt = (job as any).on_my_way_sent_at || null;
  const startedAt = (job as any).started_at || null;
  const completedAt = (job as any).completed_at || null;
  const isFinished = ["done", "invoiced"].includes(String(job.status || "").toLowerCase()) || Boolean(completedAt);
  const hasPhotos = Number(techWork?.attachment_count || 0) > 0 || Boolean(techWork?.photos_uploaded_at);
  const hasEstimate = Number(techWork?.estimate_count || 0) > 0 || Boolean(techWork?.latest_estimate_at);
  const hasFindings = Boolean(techWork?.tech_next_step);
  const techStage: TechStage = (() => {
    if (isFinished) return "done";
    if (!onMyWaySentAt) return "destination";
    if (!startedAt) return "arrive";
    if (!hasPhotos) return "photos";
    if (!hasFindings) return "jarvis";
    return "wrap";
  })();
  const activeStage = manualStage || techStage;
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

  const statusProps = {
    jobId: id!,
    status: job.status || "new",
    onMyWaySentAt,
    startedAt,
    completedAt,
    pausedAt: (job as any).paused_at || null,
    description: job.description || null,
    hcpNote: (job as any).hcp_note || null,
    customerPhone,
    customerName,
    jobAddress: customerAddress,
    employeeName,
    employeeId: employeeId || null,
  };
  const weatherSnapshot = {
    weather_captured_at: (job as any).weather_captured_at || null,
    weather_captured_by: (job as any).weather_captured_by || null,
    weather_condition: (job as any).weather_condition || null,
    weather_temp_high: (job as any).weather_temp_high ?? null,
    weather_temp_low: (job as any).weather_temp_low ?? null,
    weather_feels_like_high: (job as any).weather_feels_like_high ?? null,
    weather_humidity_max: (job as any).weather_humidity_max ?? null,
    weather_precip_chance: (job as any).weather_precip_chance ?? null,
    weather_wind_max_mph: (job as any).weather_wind_max_mph ?? null,
    weather_summary: (job as any).weather_summary || null,
    weather_source_date: (job as any).weather_source_date || null,
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
                <p className="mt-1 text-xs leading-relaxed">Missing {contextIssues.join(", ")}.</p>
              </div>
            </div>
          </div>
        ) : null}

        <CustomerStrip
          customerName={customerName}
          customerPhone={customerPhone}
          customerEmail={customerEmail}
          customerAddress={customerAddress}
          status={statusLabel(job)}
          showNavigate={Boolean(customerAddress)}
          onNavigate={openNavigation}
          onCall={callCustomer}
          onSms={openSms}
        />

        {activeStage === "destination" ? (
          <StageShell icon={Navigation} label="Next" title="Head to job">
            <DestinationMedia address={customerAddress} />
            <TechStatusCard {...statusProps} display="single" singleAction="omw" />
          </StageShell>
        ) : null}

        {activeStage === "arrive" ? (
          <StageShell icon={MapPin} label="Next" title="Arrive">
            <DestinationMedia address={customerAddress} compact />
            <TechStatusCard {...statusProps} display="single" singleAction="arrive" />
          </StageShell>
        ) : null}

        {activeStage === "photos" ? (
          <StageShell icon={ImagePlus} label="Next" title="Photos" id="tech-findings">
            <TechAttachmentsCard
              jobId={id!}
              hcpId={(job as any).hcp_id || null}
              customerPhone={customerPhone}
              jobNumber={jobNumber}
              techName={job.assigned_to || null}
              bare
            />
            <StageShortcutButtons
              onJarvis={() => setManualStage("jarvis")}
              onPhotos={() => setManualStage("photos")}
              onQuote={() => navigate(`/tech/jobs/${id}/cart`)}
              active="photos"
            />
          </StageShell>
        ) : null}

        {activeStage === "jarvis" ? (
          <StageShell icon={Mic} label="Next" title="Jarvis" id="tech-jarvis">
            <TechJarvisPushToTalk
              jobId={id!}
              jobNumber={jobNumber}
              customerName={customerName}
              bare
              onOpenPhotos={() => setManualStage("photos")}
              onOpenCart={() => navigate(`/tech/jobs/${id}/cart`)}
              enableProposalActions
            />
            <StageShortcutButtons
              onJarvis={() => setManualStage("jarvis")}
              onPhotos={() => setManualStage("photos")}
              onQuote={() => navigate(`/tech/jobs/${id}/cart`)}
              active="jarvis"
            />
          </StageShell>
        ) : null}

        {activeStage === "quote" ? (
          <StageShell icon={Wrench} label="Next" title="Quote">
            <button
              type="button"
              onClick={() => navigate(`/tech/jobs/${id}/cart`)}
              className="flex min-h-[86px] w-full items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 p-4 text-left transition active:scale-[0.99]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Wrench className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold text-foreground">Build Quote</span>
                {techWork?.tech_next_step ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{techWork.tech_next_step}</span> : null}
              </span>
            </button>
            <StageShortcutButtons
              onJarvis={() => setManualStage("jarvis")}
              onPhotos={() => setManualStage("photos")}
              onQuote={() => navigate(`/tech/jobs/${id}/cart`)}
              active="quote"
            />
          </StageShell>
        ) : null}

        {activeStage === "wrap" ? (
          <StageShell icon={CheckCircle2} label="Next" title="Finish">
            <TechStatusCard {...statusProps} display="single" singleAction="finish" />
            <StageShortcutButtons
              onJarvis={() => setManualStage("jarvis")}
              onPhotos={() => setManualStage("photos")}
              onQuote={() => navigate(`/tech/jobs/${id}/cart`)}
            />
          </StageShell>
        ) : null}

        {activeStage === "done" ? (
          <StageShell icon={CheckCircle2} label="Done" title="Finished">
            <TechStatusCard {...statusProps} display="single" singleAction="finish" />
            <StageShortcutButtons
              onJarvis={() => setManualStage("jarvis")}
              onPhotos={() => setManualStage("photos")}
              onQuote={() => navigate(`/tech/jobs/${id}/cart`)}
            />
          </StageShell>
        ) : null}

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

        <TechCollapsibleCard icon={CloudSun} title="Weather" iconBg="bg-sky-500/10" iconColor="text-sky-500" defaultOpen={false}>
          <div className="p-4">
            <TechWeatherCard
              jobId={id!}
              scheduledDate={job.scheduled_date || null}
              techName={job.assigned_to || employeeName}
              saved={weatherSnapshot}
              allowSave={false}
              bare
            />
          </div>
        </TechCollapsibleCard>

        <TechCollapsibleCard icon={FileText} title="Notes" iconBg="bg-amber-500/10" iconColor="text-amber-600" defaultOpen={false}>
          <div className="space-y-3 p-4">
            <InfoBlock label="Customer" value={problemSummary} />
            <div className="grid grid-cols-2 gap-2">
              <FieldTile icon={Wrench} label="Type" value={cleanLabel(job.job_type || "Service")} />
              <FieldTile icon={CheckCircle2} label="Goal" value="Customer approval" />
            </div>
          </div>
        </TechCollapsibleCard>
      </main>
    </div>
  );
}

type TechStage = "destination" | "arrive" | "photos" | "jarvis" | "quote" | "wrap" | "done";

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

function CustomerStrip({
  customerName,
  customerPhone,
  customerEmail,
  customerAddress,
  status,
  showNavigate,
  onNavigate,
  onCall,
  onSms,
}: {
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  status: string;
  showNavigate: boolean;
  onNavigate: () => void;
  onCall: () => void;
  onSms: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-bold leading-tight text-foreground">{customerName}</h1>
            <Badge className="shrink-0 rounded-sm text-[10px]">{status}</Badge>
          </div>
          <div className="mt-1 space-y-0.5 text-xs leading-snug text-muted-foreground">
            <p className="flex gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">{customerAddress || "No address"}</span>
            </p>
            {customerPhone && <p>{customerPhone}</p>}
            {customerEmail && <p className="truncate">{customerEmail}</p>}
          </div>
        </div>
      </div>

      <div className={cn("grid gap-2 border-t p-2", showNavigate ? "grid-cols-3" : "grid-cols-2")}>
        {showNavigate ? (
          <Button className="h-11 gap-2" onClick={onNavigate} disabled={!customerAddress}>
            <Navigation className="h-4 w-4" />
            Navigate
          </Button>
        ) : null}
        <Button variant="outline" className="h-11 gap-2" onClick={onCall} disabled={!customerPhone}>
          <Phone className="h-4 w-4" />
          Call
        </Button>
        <Button variant="outline" className="h-11 gap-2" onClick={onSms} disabled={!customerPhone}>
          <MessageSquare className="h-4 w-4" />
          Text
        </Button>
      </div>
    </section>
  );
}

function StageShell({
  icon: Icon,
  label,
  title,
  id,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="flex items-center gap-3 border-b p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <h2 className="text-lg font-bold leading-tight text-foreground">{title}</h2>
        </div>
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}

function DestinationMedia({ address, compact }: { address: string | null; compact?: boolean }) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-[0.8fr_1.2fr]" : "grid-cols-[1.15fr_0.85fr]")}>
      <TownMapPreview address={address} compact={compact} />
      <StreetViewThumbnail address={address} aspect="square" className={compact ? "min-h-[120px]" : "min-h-[160px]"} />
    </div>
  );
}

function StageShortcutButtons({
  onJarvis,
  onPhotos,
  onQuote,
  active,
}: {
  onJarvis: () => void;
  onPhotos: () => void;
  onQuote: () => void;
  active?: "jarvis" | "photos" | "quote";
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
      <button
        type="button"
        onClick={onJarvis}
        className={cn("rounded-lg border bg-card p-3 text-left transition active:scale-[0.98]", active === "jarvis" && "border-primary/50 bg-primary/10")}
      >
        <Mic className="h-5 w-5 text-primary" />
        <p className="mt-2 text-sm font-semibold leading-tight text-foreground">Talk</p>
      </button>
      <button
        type="button"
        onClick={onPhotos}
        className={cn("rounded-lg border bg-card p-3 text-left transition active:scale-[0.98]", active === "photos" && "border-primary/50 bg-primary/10")}
      >
        <ImagePlus className="h-5 w-5 text-primary" />
        <p className="mt-2 text-sm font-semibold leading-tight text-foreground">Photos</p>
      </button>
      <button
        type="button"
        onClick={onQuote}
        className={cn("flex w-16 flex-col items-center justify-center rounded-lg border bg-card p-2 text-center transition active:scale-[0.98]", active === "quote" && "border-primary/50 bg-primary/10")}
        aria-label="Open quote"
      >
        <Wrench className="h-5 w-5 text-primary" />
        <p className="mt-1 text-[11px] font-semibold leading-tight text-foreground">Quote</p>
      </button>
    </div>
  );
}

function TownMapPreview({ address, compact }: { address: string | null; compact?: boolean }) {
  if (!address || !GOOGLE_MAPS_API_KEY) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg border bg-muted text-muted-foreground", compact ? "min-h-[120px]" : "min-h-[160px]")}>
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
      className={cn("relative overflow-hidden rounded-lg border bg-muted", compact ? "min-h-[120px]" : "min-h-[160px]")}
      aria-label="Open map"
    >
      <img src={mapUrl} alt={`Map near ${address}`} className="h-full w-full object-cover" loading="lazy" />
      <div className="absolute bottom-2 left-2 rounded-sm bg-background/90 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm">
        Map
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
