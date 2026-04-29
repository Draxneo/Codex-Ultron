import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useRef, useEffect } from "react";
import { useJob } from "@/hooks/useJobs";
import { useCustomer } from "@/hooks/useCustomers";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, FileText, Plus, Send, Printer } from "lucide-react";
import { JobV2Header } from "@/components/job-v2/JobV2Header";
import { JobV2ActionBar } from "@/components/job-v2/JobV2ActionBar";
import { JobV2CustomerCard } from "@/components/job-v2/JobV2CustomerCard";
import { JobV2Sidebar } from "@/components/job-v2/JobV2Sidebar";
import { JobV2LineItems } from "@/components/job-v2/JobV2LineItems";
import { JobV2CollapsibleSections } from "@/components/job-v2/JobV2CollapsibleSections";
import { JobExpectedItemsCard } from "@/components/job-v2/JobExpectedItemsCard";
import { JobCartStatusCard } from "@/components/cart/JobCartStatusCard";
import CustomerInvoicePanel from "@/components/CustomerInvoicePanel";
import { JobActivityFeed } from "@/components/ActivityFeed";
import { PhotoLocationMap } from "@/components/PhotoLocationMap";
import { JobPurchasesPanel } from "@/components/job/JobPurchasesPanel";
import { WorkSummaryCard } from "@/components/work/WorkSummaryCard";
import { useIsMobile } from "@/hooks/use-mobile";
import TechJobDetail from "@/pages/TechJobDetail";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { data: job, isLoading, isError } = useJob(id!);
  const { data: linkedCustomer } = useCustomer(job?.customer_id || undefined);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const lineItemsRef = useRef<HTMLDivElement>(null);

  // Deep-link support: ?tab=invoice or ?tab=cart scrolls to relevant section
  const tabParam = searchParams.get("tab");
  useEffect(() => {
    if (isLoading || !job) return;
    if (tabParam === "invoice") {
      setTimeout(() => invoiceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    } else if (tabParam === "cart") {
      setTimeout(() => lineItemsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }
  }, [tabParam, isLoading, job]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="p-6 space-y-4">
          <Skeleton className="h-12 w-1/2" />
          <div className="grid grid-cols-12 gap-4">
            <Skeleton className="h-[400px] col-span-4" />
            <Skeleton className="h-[400px] col-span-8" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !job) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="px-6 py-3 flex items-center bg-background border-b">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
        <main className="max-w-xl mx-auto px-6 py-16 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <h1 className="text-xl font-semibold">Job not found</h1>
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
  const customerPhone = job.customer_phone || linkedCustomer?.phone || linkedCustomer?.mobile_phone || "";
  const customerEmail = job.customer_email || linkedCustomer?.email || "";
  const customerAddress =
    job.address ||
    [linkedCustomer?.address, linkedCustomer?.city, linkedCustomer?.state, linkedCustomer?.zip].filter(Boolean).join(", ") ||
    "";

  const scrollToInvoice = () => {
    invoiceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isMobile) {
    return <TechJobDetail />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <div className="px-6 py-3 flex items-center justify-between bg-background border-b">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/records/job/${id}`)}>
          <FileText className="h-4 w-4" />
          Document view
        </Button>
      </div>

      <JobV2Header job={job} customerName={customerName} customerId={job.customer_id} />

      <main className="px-6 py-4 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT COLUMN — Customer + Sidebar */}
          <aside className="col-span-12 lg:col-span-3 space-y-3">
            <JobV2CustomerCard
              customerName={customerName}
              customerId={job.customer_id}
              customerPhone={customerPhone}
              customerEmail={customerEmail}
              customerAddress={customerAddress}
              notificationsEnabled={(linkedCustomer as any)?.notifications_enabled ?? true}
              hasCardOnFile={!!(linkedCustomer as any)?.default_payment_method_id}
            />

            {customerAddress && (
              <Card className="overflow-hidden">
                <div className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Location
                </div>
                <PhotoLocationMap jobId={id!} jobAddress={customerAddress} />
              </Card>
            )}

            <JobV2Sidebar
              job={job}
              jobId={id!}
              customerId={job.customer_id}
              customerLeadSource={(linkedCustomer as any)?.lead_source}
            />
          </aside>

          {/* MAIN COLUMN */}
          <section className="col-span-12 lg:col-span-9 space-y-3">
            <JobV2ActionBar job={job} jobId={id!} onInvoiceClick={scrollToInvoice} />

            <JobExpectedItemsCard job={job} jobId={id!} />

            <JobCartStatusCard jobId={id!} customerName={customerName} customerPhone={customerPhone} />

            <WorkSummaryCard description={job.description} />

            <div ref={invoiceRef}>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Invoice
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="default" className="h-8">
                      <Send className="h-3.5 w-3.5" /> Send invoice
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <CustomerInvoicePanel
                  jobId={id!}
                  jobType={job.job_type || null}
                  customerName={customerName || undefined}
                  customerPhone={customerPhone || undefined}
                  customerEmail={customerEmail || undefined}
                />
              </Card>
            </div>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Estimates
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    const params = new URLSearchParams({
                      job_id: id!,
                      ...(customerName ? { customer_name: customerName } : {}),
                      ...(customerPhone ? { customer_phone: customerPhone } : {}),
                      ...(customerEmail ? { customer_email: customerEmail } : {}),
                    });
                    navigate(`/quick-quote?${params.toString()}`);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Estimate
                </Button>
              </div>
              {(job as any).estimate_id ? (
                <div className="mt-3 overflow-hidden rounded-md border">
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-background px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">Estimate copied to this job</p>
                      <p className="text-xs text-muted-foreground">
                        Keep the estimate and install job connected for sales history, presentation context, and conversion tracking.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      Copied to job
                    </span>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => navigate(`/estimates/${(job as any).estimate_id}`)}>
                      View
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">
                  No estimates linked to this job. Build one from this job to keep the presentation and cart history attached.
                </p>
              )}
            </Card>

            <div ref={lineItemsRef}>
              <JobV2LineItems jobId={id!} assignedTo={job.assigned_to} />
            </div>

            <JobPurchasesPanel jobId={id!} />

            <Card className="p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Service plan
              </h3>
              <p className="text-sm text-muted-foreground">No active maintenance plan.</p>
            </Card>

            <JobV2CollapsibleSections job={job} />

            <Card>
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Activity feed
                </h3>
              </div>
              <JobActivityFeed jobId={id!} />
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
