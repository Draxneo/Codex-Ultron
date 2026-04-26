import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  Loader2,
  Printer,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { JobV2CustomerCard } from "@/components/job-v2/JobV2CustomerCard";
import { JobV2Sidebar } from "@/components/job-v2/JobV2Sidebar";
import { WorkOrderHeader } from "@/components/work/WorkOrderHeader";
import { WorkSummaryCard } from "@/components/work/WorkSummaryCard";
import { ExpectedItemsCard } from "@/components/work/ExpectedItemsCard";
import { CustomerSmsTab } from "@/components/SmsEmbedTab";
import { CustomerCallsTab } from "@/components/CallLogEmbedTab";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCustomer } from "@/hooks/useCustomers";
import { useEstimate, useUpdateEstimateStatus } from "@/hooks/useEstimates";
import { usePresentationsForEstimate, useResponsesForEstimate } from "@/hooks/useEstimatePresentations";
import { useIsMobile } from "@/hooks/use-mobile";
import { getExpectedJobItems } from "@/lib/expectedJobItems";
import { paymentPreferenceLabel } from "@/lib/paymentOptions";
import { cn } from "@/lib/utils";
import { DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_SHORT_NAME } from "@/lib/companyDefaults";

interface EstimateReview {
  id: string;
  status: string;
  selected_tiers: string[];
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  payment_preference: string | null;
  employee_name?: string;
}

const reviewStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_review: { label: "Pending Review", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  sent: { label: "Sent", variant: "outline" },
  revision_requested: { label: "Revision Requested", variant: "destructive" },
};

function EstimateActionBar({
  estimate,
  estimateId,
  linkedJobId,
  latestPresentationToken,
  converting,
  onConvert,
}: {
  estimate: any;
  estimateId: string;
  linkedJobId: string | null;
  latestPresentationToken?: string | null;
  converting: boolean;
  onConvert: () => void;
}) {
  const navigate = useNavigate();
  const scheduleSub = estimate?.scheduled_date
    ? `${format(new Date(`${estimate.scheduled_date}T00:00:00`), "MMM d")}${estimate.arrival_start ? ` - ${estimate.arrival_start}` : ""}`
    : "Not scheduled";

  const quoteParams = new URLSearchParams({ estimate_id: estimateId });
  if (estimate.customer_name) quoteParams.set("customer_name", estimate.customer_name);
  if (estimate.customer_phone) quoteParams.set("customer_phone", estimate.customer_phone);
  if (estimate.customer_email) quoteParams.set("customer_email", estimate.customer_email);
  const presentationUrl = latestPresentationToken ? `${window.location.origin}/presentation/${latestPresentationToken}` : null;

  const actionClass =
    "flex-1 min-w-[120px] flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-md border border-border bg-background hover:bg-accent transition-colors";
  const disabledActionClass = `${actionClass} opacity-60 cursor-not-allowed hover:bg-background`;

  return (
    <Card className="p-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={actionClass}
          onClick={() => navigate(estimate?.scheduled_date ? `/?date=${estimate.scheduled_date}` : "/")}
        >
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Schedule</span>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">{scheduleSub}</span>
        </button>
        <button type="button" className={actionClass} onClick={() => navigate(`/quick-quote?${quoteParams.toString()}`)}>
          <Zap className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Build Quote</span>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">Options & pricing</span>
        </button>
        <button
          type="button"
          className={estimate.customer_phone ? actionClass : disabledActionClass}
          disabled={!estimate.customer_phone}
          onClick={() => {
            if (!estimate.customer_phone) return;
            const firstName = String(estimate.customer_name || "").split(" ")[0] || "there";
            const body = presentationUrl
              ? `Hi ${firstName}, here is your estimate from ${DEFAULT_COMPANY_NAME}: ${presentationUrl}`
              : `Hi ${firstName}, your ${DEFAULT_COMPANY_SHORT_NAME} estimate is ready. I will send the proposal link shortly.`;
            navigate(`/inbox?section=sms&phone=${encodeURIComponent(estimate.customer_phone)}&draft=${encodeURIComponent(body)}`);
          }}
        >
          <Send className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Send</span>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">
            {estimate.customer_phone ? "Draft SMS" : "No phone"}
          </span>
        </button>
        {linkedJobId ? (
          <button type="button" className={actionClass} onClick={() => navigate(`/jobs/${linkedJobId}`)}>
            <ArrowRight className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">View Job</span>
            <span className="text-center text-[10px] leading-tight text-muted-foreground">Converted</span>
          </button>
        ) : (
          <button type="button" className={actionClass} disabled={converting} onClick={onConvert}>
            {converting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
            <span className="text-xs font-semibold uppercase tracking-wide">Convert</span>
            <span className="text-center text-[10px] leading-tight text-muted-foreground">Approved to job</span>
          </button>
        )}
        <button
          type="button"
          className={presentationUrl ? actionClass : disabledActionClass}
          disabled={!presentationUrl}
          onClick={() => presentationUrl && window.open(presentationUrl, "_blank", "noopener,noreferrer")}
        >
          <FileText className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Proposal</span>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">
            {presentationUrl ? "Preview" : "Not built"}
          </span>
        </button>
        <button type="button" className={actionClass} onClick={() => window.print()}>
          <Printer className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Print</span>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">Estimate</span>
        </button>
      </div>
    </Card>
  );
}

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: estimate, isLoading } = useEstimate(id);
  const { data: linkedCustomer } = useCustomer(estimate?.customer_id || undefined);
  const updateStatus = useUpdateEstimateStatus();
  const [review, setReview] = useState<EstimateReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [linkedJobId, setLinkedJobId] = useState<string | null>(null);
  const [convertingToJob, setConvertingToJob] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: presentations } = usePresentationsForEstimate(id);
  const { data: customerResponses } = useResponsesForEstimate(id);
  const estimateStatus = estimate?.work_status || estimate?.status || "new";
  const expectedItems = useMemo(
    () => estimate ? getExpectedJobItems({ ...estimate, job_type: "estimate", status: estimateStatus }) : [],
    [estimate, estimateStatus],
  );

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("estimate_reviews")
        .select("*")
        .eq("estimate_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
      const row = data?.[0];
      if (row) {
        const { data: emp } = await supabase.from("employees").select("name").eq("id", row.employee_id).single();
        setReview({ ...row, selected_tiers: (row.selected_tiers || []) as string[], employee_name: emp?.name || "Unknown" });
      }
      setReviewLoading(false);

      const { data: linkedJobs } = await supabase.from("jobs").select("id").eq("estimate_id", id).limit(1);
      if (linkedJobs?.[0]) setLinkedJobId(linkedJobs[0].id);
    })();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {!isMobile && <AppHeader />}
        <main className="p-6">
          <Skeleton className="h-12 w-1/2" />
          <div className="mt-4 grid grid-cols-12 gap-4">
            <Skeleton className="col-span-4 h-[400px]" />
            <Skeleton className="col-span-8 h-[400px]" />
          </div>
        </main>
      </div>
    );
  }

  if (!estimate || !id) {
    return (
      <div className="min-h-screen bg-background">
        {!isMobile && <AppHeader />}
        <main className="p-4 text-center text-muted-foreground">Estimate not found</main>
      </div>
    );
  }

  const customerName =
    estimate.customer_name ||
    [linkedCustomer?.first_name, linkedCustomer?.last_name].filter(Boolean).join(" ") ||
    linkedCustomer?.company ||
    "Unknown";
  const customerPhone = estimate.customer_phone || linkedCustomer?.phone || linkedCustomer?.mobile_phone || "";
  const customerEmail = estimate.customer_email || linkedCustomer?.email || "";
  const customerAddress =
    estimate.address ||
    [linkedCustomer?.address, linkedCustomer?.city, linkedCustomer?.state, linkedCustomer?.zip].filter(Boolean).join(", ") ||
    "";
  const status = estimateStatus;
  const reviewConfig = review ? (reviewStatusConfig[review.status] || reviewStatusConfig.pending_review) : null;
  const latestPresentationToken = presentations?.[0]?.token || null;

  const handleConvert = async () => {
    setConvertingToJob(true);
    try {
      await updateStatus.mutateAsync({ id, status: "won" });
      const { data: newJobs } = await supabase.from("jobs").select("id").eq("estimate_id", id).limit(1);
      if (newJobs?.[0]) {
        setLinkedJobId(newJobs[0].id);
        toast.success("Job created successfully");
      } else {
        toast.success("Estimate marked won");
      }
    } catch (e: any) {
      toast.error("Failed to create job: " + e.message);
    } finally {
      setConvertingToJob(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {!isMobile && <AppHeader />}
      <div className="flex items-center bg-background px-6 py-3 border-b">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete estimate #{estimate.estimate_number || "-"} for {customerName}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Estimate</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await supabase.from("estimates").delete().eq("id", id);
                    toast.success("Estimate deleted");
                    navigate(-1);
                  } catch (e: any) {
                    toast.error("Delete failed: " + e.message);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Deleting..." : "Delete Estimate"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <WorkOrderHeader
        entity={estimate}
        entityType="estimate"
        customerName={customerName}
        customerId={estimate.customer_id}
        number={estimate.estimate_number}
        status={status}
        hcpUrl={estimate.hcp_id ? `https://pro.housecallpro.com/app/estimates/${estimate.hcp_id}` : null}
      />

      <main className="mx-auto max-w-[1600px] px-6 py-4">
        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-12 space-y-3 lg:col-span-3">
            <JobV2CustomerCard
              customerName={customerName}
              customerId={estimate.customer_id}
              customerPhone={customerPhone}
              customerEmail={customerEmail}
              customerAddress={customerAddress}
              notificationsEnabled={(linkedCustomer as any)?.notifications_enabled ?? true}
              hasCardOnFile={!!(linkedCustomer as any)?.default_payment_method_id}
            />
            <JobV2Sidebar
              job={{ ...estimate, status, tags: [] }}
              jobId={id}
              customerId={estimate.customer_id}
              customerLeadSource={(linkedCustomer as any)?.lead_source}
            />
          </aside>

          <section className="col-span-12 space-y-3 lg:col-span-9">
            <EstimateActionBar
              estimate={estimate}
              estimateId={id}
              linkedJobId={linkedJobId}
              latestPresentationToken={latestPresentationToken}
              converting={convertingToJob || updateStatus.isPending}
              onConvert={handleConvert}
            />

            <ExpectedItemsCard
              items={expectedItems}
              subtitle="Estimate flow: schedule, build options, send, approve, convert."
              quickActions={(item) => {
                if (item.key === "quote_built") {
                  return {
                    label: "Build",
                    run: () => {
                      const params = new URLSearchParams({ estimate_id: id });
                      if (estimate.customer_name) params.set("customer_name", estimate.customer_name);
                      if (estimate.customer_phone) params.set("customer_phone", estimate.customer_phone);
                      navigate(`/quick-quote?${params.toString()}`);
                    },
                  };
                }
                if (item.key === "customer_decision") {
                  return { label: "Won", busy: updateStatus.isPending, run: handleConvert };
                }
                return null;
              }}
            />

            <WorkSummaryCard description={estimate.description} />

            <Card>
              <CardHeader className="border-b py-3">
                <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                  <ClipboardCheck className="h-4 w-4" /> Estimate Review
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {reviewLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : review ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Submitted by {review.employee_name}</span>
                      {reviewConfig && <Badge variant={reviewConfig.variant}>{reviewConfig.label}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submitted {format(new Date(review.created_at), "MMM d, yyyy h:mm a")}
                    </p>
                    {review.selected_tiers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {review.selected_tiers.map((tier) => (
                          <Badge key={tier} variant="outline">{tier}</Badge>
                        ))}
                      </div>
                    )}
                    {review.payment_preference && (
                      <p><strong>Payment:</strong> {paymentPreferenceLabel(review.payment_preference)}</p>
                    )}
                    {review.admin_notes && (
                      <p className="italic text-muted-foreground">"{review.admin_notes}"</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No estimate review submitted yet.</p>
                )}
              </CardContent>
            </Card>

            {presentations && presentations.length > 0 && (
              <Card>
                <CardHeader className="border-b py-3">
                  <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Presentation Tracking</CardTitle>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {presentations.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{p.customer_email || customerEmail || "Customer"}</p>
                        <p className="text-xs text-muted-foreground">Sent {format(new Date(p.created_at), "MMM d, yyyy")}</p>
                      </div>
                      <Badge variant={p.view_count > 0 ? "outline" : "secondary"}>
                        {p.view_count > 0 ? `${p.view_count} viewed` : "Not viewed"}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {customerResponses && customerResponses.length > 0 && (
              <Card>
                <CardHeader className="border-b py-3">
                  <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Customer Decisions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-4">
                  {customerResponses.map((r) => (
                    <div
                      key={r.id}
                      className={cn(
                        "rounded border p-3 text-sm",
                        r.action === "approved" && "border-emerald-200 bg-emerald-50",
                        r.action === "changes_requested" && "border-amber-200 bg-amber-50",
                        r.action === "declined" && "border-red-200 bg-red-50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <JobStatusBadge status={r.action} entityType="estimate" />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(r.responded_at), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                      {(r as any).selected_tier && <p className="mt-2"><strong>System:</strong> {(r as any).selected_tier}</p>}
                      {r.payment_preference && <p className="mt-1"><strong>Payment:</strong> {paymentPreferenceLabel(r.payment_preference)}</p>}
                      {(r as any).selected_addons && Array.isArray((r as any).selected_addons) && (r as any).selected_addons.length > 0 && (
                        <p className="mt-1"><strong>Add-ons:</strong> {(r as any).selected_addons.join(", ")}</p>
                      )}
                      {r.message && <p className="mt-2 italic text-muted-foreground">"{r.message}"</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">SMS</h3>
                </div>
                {customerPhone ? <CustomerSmsTab phones={[customerPhone]} /> : <p className="p-4 text-sm text-muted-foreground">No customer phone on file</p>}
              </Card>
              <Card className="overflow-hidden">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Calls</h3>
                </div>
                {customerPhone ? (
                  <CustomerCallsTab phones={[customerPhone]} customerId={estimate.customer_id || undefined} />
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">No customer phone on file</p>
                )}
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
