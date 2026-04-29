/**
 * TechJobDetail.tsx - Field Brain job view for technicians.
 *
 * Mobile route: /tech/jobs/:id
 * The screen is organized around who, what, when, where, and why so the
 * technician can diagnose, document, propose, and get customer approval.
 */

import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  CloudSun,
  DollarSign,
  FileText,
  Home,
  ImagePlus,
  MapPin,
  Mic,
  PackageCheck,
  Plug,
  Shield,
  ShoppingCart,
  Sparkles,
  User2,
  Wrench,
} from "lucide-react";
import { useJob } from "@/hooks/useJobs";
import { useCustomer } from "@/hooks/useCustomers";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useCustomerJobs } from "@/hooks/useCustomerHistory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TechStatusCard } from "@/components/tech/TechStatusCard";
import { TechCustomerCard } from "@/components/tech/TechCustomerCard";
import { TechServicePlansCard } from "@/components/tech/TechServicePlansCard";
import { TechScheduleCard } from "@/components/tech/TechScheduleCard";
import { TechAttachmentsCard } from "@/components/tech/TechAttachmentsCard";
import { TechIntegrationRow } from "@/components/tech/TechIntegrationRow";
import { TechJarvisPushToTalk } from "@/components/tech/TechJarvisPushToTalk";
import { TechCollapsibleCard } from "@/components/tech/TechCollapsibleCard";
import { TechWeatherCard } from "@/components/tech/TechWeatherCard";
import { TechCartCard } from "@/components/tech/TechCartCard";
import { useJobCart } from "@/hooks/useJobCart";

function cleanLabel(value?: string | null) {
  return value ? value.replace(/_/g, " ") : "";
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
    "Document the diagnosis, photos, and customer concern before building options."
  );
}

function statusLabel(job: any) {
  return cleanLabel(job?.status || "new").toUpperCase();
}

export default function TechJobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { employeeId } = useEffectiveAuth();
  const { data: job, isLoading, isError } = useJob(id!);
  const { data: linkedCustomer } = useCustomer(job?.customer_id || undefined);
  const { data: customerJobs } = useCustomerJobs(job?.customer_id || undefined);
  const { cart, itemCount, isLoading: cartLoading } = useJobCart(id!);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="flex min-h-full flex-col bg-background">
        <header className="sticky top-0 z-20 flex h-12 items-center border-b border-border bg-card px-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-foreground">Job not found</p>
          </div>
          <div className="w-9" />
        </header>
        <main className="px-6 py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <h1 className="text-lg font-semibold">Job not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This job may have been deleted, moved, or the link is invalid.</p>
        </main>
      </div>
    );
  }

  const customerName =
    job.customer_name ||
    [linkedCustomer?.first_name, linkedCustomer?.last_name].filter(Boolean).join(" ") ||
    linkedCustomer?.company ||
    "Unknown";
  const customerPhone = job.customer_phone || linkedCustomer?.phone || linkedCustomer?.mobile_phone || null;
  const customerEmail = job.customer_email || linkedCustomer?.email || null;
  const customerAddress =
    job.address ||
    [linkedCustomer?.address, linkedCustomer?.city, linkedCustomer?.state, linkedCustomer?.zip].filter(Boolean).join(", ") ||
    null;

  const jobNumber = job.job_number || job.hcp_job_number || "-";
  const jobCount = customerJobs?.length;
  const employeeName = job.assigned_to || null;
  const arrivalStart = (job as any).arrival_start || null;
  const arrivalEnd = (job as any).arrival_end || null;
  const problemSummary = jobProblem(job);
  const approvalState =
    itemCount === 0
      ? "No options built"
      : (cart as any)?.status === "sent"
        ? "Waiting on customer"
        : (cart as any)?.status === "approved"
          ? "Approved"
          : `${itemCount} option${itemCount === 1 ? "" : "s"} ready`;

  return (
    <div className="flex min-h-full flex-col bg-muted/20 pb-28">
      <header className="sticky top-0 z-20 flex h-12 items-center border-b border-border bg-background/95 px-2 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-sm font-semibold text-foreground">Field Brain</p>
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Job {jobNumber} - {statusLabel(job)}
          </p>
        </div>
        <div className="w-9" />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pt-3">
        <section className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="border-b bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge variant="outline" className="mb-2 bg-background">Tech mobile</Badge>
                <h1 className="truncate text-xl font-bold text-foreground">{customerName}</h1>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{problemSummary}</p>
              </div>
              <Badge className="shrink-0">{statusLabel(job)}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            <Button variant="outline" className="h-12 gap-2 text-xs" onClick={() => scrollToSection("tech-findings")}>
              <ImagePlus className="h-4 w-4" />
              Findings
            </Button>
            <Button variant="outline" className="h-12 gap-2 text-xs" onClick={() => scrollToSection("tech-jarvis")}>
              <Mic className="h-4 w-4" />
              JARVIS
            </Button>
            <Button className="h-12 gap-2 text-xs" onClick={() => navigate(`/tech/jobs/${id}/cart`)}>
              <ShoppingCart className="h-4 w-4" />
              Proposal
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <FieldSignal icon={User2} label="Who" value={customerName} detail={customerPhone || "No phone on file"} />
          <FieldSignal icon={FileText} label="What" value={cleanLabel(job.job_type || "Service")} detail={problemSummary} />
          <FieldSignal icon={CalendarClock} label="When" value={formatSchedule(job.scheduled_date || null, arrivalStart, arrivalEnd)} detail={employeeName || "Unassigned"} />
          <FieldSignal icon={MapPin} label="Where" value={customerAddress || "No address"} detail="Navigate, call, text, or update dispatch." />
          <div className="col-span-2">
            <FieldSignal icon={PackageCheck} label="Why" value={approvalState} detail="Build repair or replacement options that explain comfort, reliability, peace of mind, efficiency, and approval." />
          </div>
        </section>

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

        <TechCollapsibleCard icon={Home} title="Who + Where" iconBg="bg-primary/10" iconColor="text-primary" collapsible={false}>
          <TechCustomerCard
            customerId={job.customer_id || null}
            customerName={customerName}
            customerPhone={customerPhone}
            customerEmail={customerEmail}
            address={customerAddress}
            jobCount={jobCount}
            hcpCustomerId={linkedCustomer?.hcp_customer_id || null}
            jobId={id}
            bare
          />
        </TechCollapsibleCard>

        <TechCollapsibleCard
          icon={ClipboardCheck}
          title="What + Why"
          iconBg="bg-amber-500/10"
          iconColor="text-amber-600"
          collapsible={false}
        >
          <div className="space-y-3 p-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job concern</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{problemSummary}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <WorkflowStep title="Repair path" body="Diagnose, price the repair, send approval, then invoice after approval." />
              <WorkflowStep title="Replacement path" body="Build good/better/best options, present benefits, financing, and install handoff." />
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

        <TechCollapsibleCard
          icon={Mic}
          title="JARVIS Field Help"
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
          />
        </TechCollapsibleCard>

        <TechCollapsibleCard
          icon={ShoppingCart}
          title="Proposal + Approval"
          iconBg="bg-accent/15"
          iconColor="text-accent"
          collapsible={false}
          rightSlot={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => navigate(`/tech/jobs/${id}/cart`)}
            >
              Open
            </Button>
          }
        >
          <TechCartCard
            jobId={id!}
            customerId={job.customer_id || null}
            customerPhone={customerPhone}
            customerName={customerName}
            bare
          />
        </TechCollapsibleCard>

        <TechCollapsibleCard
          icon={CalendarClock}
          title="When"
          iconBg="bg-indigo-500/10"
          iconColor="text-indigo-500"
          defaultOpen={false}
        >
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

        <TechCollapsibleCard icon={CloudSun} title="Weather + Conditions" iconBg="bg-sky-500/10" iconColor="text-sky-500" defaultOpen={false}>
          <TechWeatherCard
            jobId={id!}
            scheduledDate={job.scheduled_date || null}
            techName={job.assigned_to || null}
            saved={{
              weather_captured_at: (job as any).weather_captured_at ?? null,
              weather_captured_by: (job as any).weather_captured_by ?? null,
              weather_condition: (job as any).weather_condition ?? null,
              weather_temp_high: (job as any).weather_temp_high ?? null,
              weather_temp_low: (job as any).weather_temp_low ?? null,
              weather_feels_like_high: (job as any).weather_feels_like_high ?? null,
              weather_humidity_max: (job as any).weather_humidity_max ?? null,
              weather_precip_chance: (job as any).weather_precip_chance ?? null,
              weather_wind_max_mph: (job as any).weather_wind_max_mph ?? null,
              weather_summary: (job as any).weather_summary ?? null,
              weather_source_date: (job as any).weather_source_date ?? null,
            }}
            bare
          />
        </TechCollapsibleCard>

        <TechCollapsibleCard
          icon={Shield}
          title="Membership + Support"
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-500"
          defaultOpen={false}
        >
          <TechServicePlansCard customerId={job.customer_id || null} bare />
        </TechCollapsibleCard>

        <TechCollapsibleCard icon={Plug} title="Tools" iconBg="bg-slate-500/10" iconColor="text-slate-500" defaultOpen={false}>
          <div>
            <TechIntegrationRow
              icon={Wrench}
              label="Bluon"
              description="HVAC parts and spec lookup"
              iconBg="bg-sky-500/10"
              iconColor="text-sky-500"
              onClick={() => (window.location.href = "bluon://search")}
            />
            <TechIntegrationRow
              icon={Sparkles}
              label="JARVIS Copilot"
              description="AI assistant for this job"
              iconBg="bg-purple-500/10"
              iconColor="text-purple-500"
              onClick={() => navigate(`/copilot?job=${id}`)}
            />
            <TechIntegrationRow
              icon={DollarSign}
              label="Desktop Pricebook"
              description="Fallback desktop cart view"
              iconBg="bg-[hsl(var(--complete))]/10"
              iconColor="text-[hsl(var(--complete))]"
              onClick={() => navigate(`/jobs/${id}?tab=cart`)}
            />
          </div>
        </TechCollapsibleCard>
      </main>

      <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-2xl px-3">
        <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-2 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
          <Button variant="outline" className="h-12 gap-1.5 text-xs" onClick={() => scrollToSection("tech-findings")}>
            <ImagePlus className="h-4 w-4" />
            Photos
          </Button>
          <Button variant="outline" className="h-12 gap-1.5 text-xs" onClick={() => scrollToSection("tech-jarvis")}>
            <Mic className="h-4 w-4" />
            JARVIS
          </Button>
          <Button className="h-12 justify-between gap-2 px-3 text-xs" onClick={() => navigate(`/tech/jobs/${id}/cart`)}>
            <span className="flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              Proposal
            </span>
            <span className="font-semibold">
              {cartLoading ? "..." : `${itemCount} - $${Number(cart?.total || 0).toFixed(2)}`}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldSignal({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3 shadow-sm">
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

function WorkflowStep({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{body}</p>
    </div>
  );
}
