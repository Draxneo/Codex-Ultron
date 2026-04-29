/**
 * TechJobDetail.tsx - Job detail card stack for technicians.
 *
 * Mobile-only route: /tech/jobs/:id
 * Reuses existing data hooks with no data changes.
 */

import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CloudSun,
  DollarSign,
  ImagePlus,
  Mic,
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
import { useJobCart } from "@/hooks/useJobCart";

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
  const employeeName = job.assigned_to || null;

  return (
    <div className="flex flex-col min-h-full bg-muted/20 pb-24">
      <header className="sticky top-0 z-20 flex items-center px-2 h-12 bg-background/95 border-b border-border backdrop-blur">
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
        <div className="w-9" />
      </header>

      <main className="px-3 pt-3 flex flex-col gap-3 max-w-2xl mx-auto w-full">
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

        <TechCollapsibleCard icon={User2} title="Customer" iconBg="bg-blue-500/10" iconColor="text-blue-500" collapsible={false}>
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
          icon={ImagePlus}
          title="Attachments"
          iconBg="bg-rose-500/10"
          iconColor="text-rose-500"
          collapsible={false}
          id="tech-photos"
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
          title="Ask JARVIS"
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
            onOpenPhotos={() => scrollToSection("tech-photos")}
            onOpenCart={() => navigate(`/tech/jobs/${id}/cart`)}
          />
        </TechCollapsibleCard>

        <TechCollapsibleCard icon={CloudSun} title="Weather" iconBg="bg-sky-500/10" iconColor="text-sky-500" collapsible={false}>
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
          title="Service Plans"
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-500"
          defaultOpen={false}
        >
          <TechServicePlansCard customerId={job.customer_id || null} bare />
        </TechCollapsibleCard>

        <TechCollapsibleCard icon={CalendarClock} title="Schedule" iconBg="bg-indigo-500/10" iconColor="text-indigo-500">
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

        <TechCollapsibleCard icon={Plug} title="Integrations" iconBg="bg-slate-500/10" iconColor="text-slate-500" defaultOpen={false}>
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

      <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-2xl px-3">
        <Button
          className="h-14 w-full justify-between rounded-lg shadow-lg"
          onClick={() => navigate(`/tech/jobs/${id}/cart`)}
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            View Cart
          </span>
          <span className="text-sm font-semibold">
            {cartLoading ? "Loading" : `${itemCount} - $${Number(cart?.total || 0).toFixed(2)}`}
          </span>
        </Button>
      </div>
    </div>
  );
}
