/**
 * TechJobDetail.tsx - Job detail card stack for technicians.
 *
 * Mobile-only route: /tech/jobs/:id
 * Reuses existing data hooks (useJob, useCustomer) with no data changes.
 */

import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, MoreVertical, FileText, DollarSign, CreditCard, Wrench, Sparkles, ExternalLink, User2, Shield, CalendarClock, ShoppingCart, ImagePlus, Mic, Plug, CloudSun } from "lucide-react";
import { useJob } from "@/hooks/useJobs";
import { useCustomer } from "@/hooks/useCustomers";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useCustomerJobs } from "@/hooks/useCustomerHistory";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TechStatusCard } from "@/components/tech/TechStatusCard";
import { TechCustomerCard } from "@/components/tech/TechCustomerCard";
import { TechServicePlansCard } from "@/components/tech/TechServicePlansCard";
import { TechScheduleCard } from "@/components/tech/TechScheduleCard";
import { TechAttachmentsCard } from "@/components/tech/TechAttachmentsCard";
import { TechIntegrationRow } from "@/components/tech/TechIntegrationRow";
import { TechCartCard } from "@/components/tech/TechCartCard";
import { TechJarvisPushToTalk } from "@/components/tech/TechJarvisPushToTalk";
import { TechCollapsibleCard } from "@/components/tech/TechCollapsibleCard";
import { TechWeatherCard } from "@/components/tech/TechWeatherCard";
import { Card } from "@/components/ui/card";

export default function TechJobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { employeeId } = useEffectiveAuth();
  const { data: job, isLoading, isError } = useJob(id!);
  const { data: linkedCustomer } = useCustomer(job?.customer_id || undefined);
  const { data: customerJobs } = useCustomerJobs(job?.customer_id || undefined);
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      <div className="flex flex-col min-h-full bg-background">
        <header className="sticky top-0 z-20 flex items-center px-2 h-12 bg-card border-b border-border">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-foreground">Job not found</p>
          </div>
          <div className="w-9" />
        </header>
        <main className="px-6 py-16 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <h1 className="text-lg font-semibold">Job not found</h1>
          <p className="text-sm text-muted-foreground mt-2">This job may have been deleted, moved, or the link is invalid.</p>
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

  return (
    <div className="flex flex-col min-h-full bg-background pb-36">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex items-center px-2 h-12 bg-card border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <p className="text-sm font-semibold text-foreground">Job {jobNumber}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </header>

      {/* Sticky action bar */}
      <div className="sticky top-12 z-10 flex items-center gap-1 px-2 h-11 bg-card border-b border-border overflow-x-auto">
        <ActionPill icon={FileText} label="Approve" />
        <ActionPill icon={FileText} label="Invoice" onClick={() => navigate(`/jobs/${id}?tab=invoice`)} />
        <ActionPill icon={CreditCard} label="Pay" onClick={() => navigate(`/jobs/${id}?tab=invoice`)} />
        {job.hcp_id && (
          <a
            href={`https://pro.housecallpro.com/app/jobs/${job.hcp_id}`}
            target="_blank"
            rel="noopener"
            className="ml-auto flex items-center gap-1 text-[11px] text-primary font-medium px-2 h-8 rounded hover:bg-primary/10"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Source
          </a>
        )}
      </div>

      {/* Card stack */}
      <main className="px-3 pt-3 flex flex-col gap-3 max-w-2xl mx-auto w-full">
        <Card className="overflow-hidden border-primary/20 bg-primary/5">
          <div className="p-4 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Tech workflow</p>
              <h1 className="text-xl font-bold text-foreground">Pictures. Talk. Cart.</h1>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                Snap what you see, tell JARVIS the diagnosis, then build the customer options and send the link.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" className="h-16 flex-col gap-1" onClick={() => scrollToSection("tech-photos")}>
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs">Photos</span>
              </Button>
              <Button type="button" className="h-16 flex-col gap-1 bg-purple-600 hover:bg-purple-700" onClick={() => scrollToSection("tech-jarvis")}>
                <Mic className="h-5 w-5" />
                <span className="text-xs">Talk</span>
              </Button>
              <Button type="button" className="h-16 flex-col gap-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => scrollToSection("tech-cart")}>
                <ShoppingCart className="h-5 w-5" />
                <span className="text-xs">Cart</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* 1. Status card */}
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
          employeeName={null}
          employeeId={employeeId || null}
        />

        {/* 2. Weather snapshot — always visible (tech-only) */}
        <TechCollapsibleCard
          icon={CloudSun}
          title="Weather"
          iconBg="bg-sky-500/10"
          iconColor="text-sky-500"
          collapsible={false}
          className="order-7"
        >
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

        {/* 3. Customer card — always visible */}
        <TechCollapsibleCard icon={User2} title="Customer" iconBg="bg-blue-500/10" iconColor="text-blue-500" collapsible={false} className="order-6">
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

        {/* 3. Service plans */}
        <TechCollapsibleCard
          icon={Shield}
          title="Service Plans"
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-500"
          defaultOpen={false}
          className="order-8"
        >
          <TechServicePlansCard customerId={job.customer_id || null} bare />
        </TechCollapsibleCard>

        {/* 4. Schedule */}
        <TechCollapsibleCard
          icon={CalendarClock}
          title="Schedule"
          iconBg="bg-indigo-500/10"
          iconColor="text-indigo-500"
          className="order-9"
        >
          <TechScheduleCard
            jobId={id!}
            jobNumber={jobNumber}
            scheduledDate={job.scheduled_date || null}
            arrivalStart={(job as any).arrival_start || null}
            arrivalEnd={(job as any).arrival_end || null}
            assignedTo={job.assigned_to || null}
            bare
          />
        </TechCollapsibleCard>

        {/* 5. Inline cart — always visible */}
        <TechCollapsibleCard
          icon={ShoppingCart}
          title="Cart"
          iconBg="bg-amber-500/10"
          iconColor="text-amber-500"
          collapsible={false}
          id="tech-cart"
          className="order-5 scroll-mt-24"
        >
          <TechCartCard jobId={id!} customerPhone={customerPhone} customerName={customerName} bare />
        </TechCollapsibleCard>

        {/* 6. Attachments — always visible */}
        <TechCollapsibleCard
          icon={ImagePlus}
          title="Attachments"
          iconBg="bg-rose-500/10"
          iconColor="text-rose-500"
          collapsible={false}
          id="tech-photos"
          className="order-3 scroll-mt-24"
        >
          <TechAttachmentsCard
            jobId={id!}
            customerPhone={customerPhone}
            jobNumber={jobNumber}
            techName={job.assigned_to || null}
            bare
          />
        </TechCollapsibleCard>

        {/* 7. Ask JARVIS (push-to-talk) — always visible */}
        <TechCollapsibleCard
          icon={Mic}
          title="Ask JARVIS"
          iconBg="bg-purple-500/10"
          iconColor="text-purple-500"
          collapsible={false}
          id="tech-jarvis"
          className="order-4 scroll-mt-24"
        >
          <TechJarvisPushToTalk
            jobId={id!}
            jobNumber={jobNumber}
            customerName={customerName}
            bare
            onOpenPhotos={() => scrollToSection("tech-photos")}
            onOpenCart={() => scrollToSection("tech-cart")}
          />
        </TechCollapsibleCard>

        {/* 8. Integrations */}
        <TechCollapsibleCard
          icon={Plug}
          title="Integrations"
          iconBg="bg-slate-500/10"
          iconColor="text-slate-500"
          defaultOpen={false}
          className="order-10"
        >
          <div>
            <TechIntegrationRow
              icon={Wrench}
              label="Bluon"
              description="HVAC parts & spec lookup"
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
              label="Visual Pricebook"
              description="Tap to add common items"
              iconBg="bg-[hsl(var(--complete))]/10"
              iconColor="text-[hsl(var(--complete))]"
              onClick={() => navigate(`/jobs/${id}?tab=cart`)}
            />
          </div>
        </TechCollapsibleCard>
      </main>

      <nav
        className="fixed left-0 right-0 bottom-16 z-30 border-t border-border bg-card/95 px-3 py-2 backdrop-blur supports-[padding:max(0px)]:pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        aria-label="Tech job quick actions"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-3 gap-2">
          <Button type="button" className="h-12 flex-col gap-0.5 text-xs" onClick={() => scrollToSection("tech-photos")}>
            <ImagePlus className="h-4 w-4" />
            Photos
          </Button>
          <Button
            type="button"
            className="h-12 flex-col gap-0.5 bg-purple-600 text-xs hover:bg-purple-700"
            onClick={() => scrollToSection("tech-jarvis")}
          >
            <Mic className="h-4 w-4" />
            Talk
          </Button>
          <Button
            type="button"
            className="h-12 flex-col gap-0.5 bg-amber-500 text-xs text-white hover:bg-amber-600"
            onClick={() => scrollToSection("tech-cart")}
          >
            <ShoppingCart className="h-4 w-4" />
            Cart
          </Button>
        </div>
      </nav>
    </div>
  );
}

function ActionPill({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium text-foreground bg-muted/50 hover:bg-muted active:bg-muted/80 shrink-0"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
