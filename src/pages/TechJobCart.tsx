import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, CreditCard, Presentation, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TechCartCard } from "@/components/tech/TechCartCard";
import { useCustomer } from "@/hooks/useCustomers";
import { useJob } from "@/hooks/useJobs";
import { errorMessage } from "@/lib/errorMessage";

export default function TechJobCart() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading, isError, error: jobQueryError } = useJob(id!);
  const { data: linkedCustomer, isError: customerError, error: customerQueryError } = useCustomer(job?.customer_id || undefined);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="flex min-h-full flex-col bg-background">
        <header className="sticky top-0 z-20 flex h-12 items-center border-b bg-background px-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-foreground">Presentation not found</p>
          </div>
          <div className="w-9" />
        </header>
        <main className="px-6 py-16 text-center">
          <Presentation className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <h1 className="text-lg font-semibold">Presentation not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {jobQueryError ? errorMessage(jobQueryError) : "This job may have moved or the link is invalid."}
          </p>
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
  const jobNumber = job.job_number || job.hcp_job_number || "-";

  return (
    <div className="flex min-h-full flex-col bg-muted/20 pb-20">
      <header className="sticky top-0 z-20 flex h-12 items-center border-b bg-background/95 px-2 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => navigate(`/tech/jobs/${id}`)}
          aria-label="Back to job"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-foreground">Proposal Builder</p>
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Job {jobNumber}</p>
        </div>
        <div className="w-9" />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pt-3">
        {customerError ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Customer details did not load.</p>
                <p className="mt-1 text-xs leading-relaxed">
                  {errorMessage(customerQueryError)}. Refresh before sending this approval link.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <section className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-2">Customer approval flow</Badge>
              <h1 className="text-xl font-bold leading-tight text-foreground">{customerName}</h1>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Build repair or replacement options, preview the customer story, then send the approval link.
              </p>
            </div>
            <Presentation className="h-6 w-6 shrink-0 text-primary" />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <ProposalStep icon={ClipboardCheck} label="Diagnose" />
            <ProposalStep icon={Presentation} label="Present" />
            <ProposalStep icon={Send} label="Approve" />
            <ProposalStep icon={CreditCard} label="Invoice" />
          </div>
        </section>

        <TechCartCard
          jobId={id!}
          customerId={job.customer_id || null}
          customerPhone={customerPhone}
          customerName={customerName}
          focused
        />
      </main>
    </div>
  );
}

function ProposalStep({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-2 py-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-primary" />
      <p className="mt-1 text-[11px] font-semibold text-foreground">{label}</p>
    </div>
  );
}
