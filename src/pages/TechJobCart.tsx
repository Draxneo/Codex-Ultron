import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TechCartCard } from "@/components/tech/TechCartCard";
import { useCustomer } from "@/hooks/useCustomers";
import { useJob } from "@/hooks/useJobs";

export default function TechJobCart() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading, isError } = useJob(id!);
  const { data: linkedCustomer } = useCustomer(job?.customer_id || undefined);

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
          <p className="mt-2 text-sm text-muted-foreground">This job may have moved or the link is invalid.</p>
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
          <p className="truncate text-sm font-semibold text-foreground">Presentation - Job {jobNumber}</p>
        </div>
        <div className="w-9" />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pt-3">
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
