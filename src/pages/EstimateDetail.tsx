import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AddressLink } from "@/components/AddressLink";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEstimate, useUpdateEstimateStatus } from "@/hooks/useEstimates";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ClipboardCheck, Phone, Mail, ExternalLink, Check, Clock, StickyNote, Save, BookOpen, ArrowRight, Loader2, Info, Camera, MessageSquare, DollarSign, Eye, ThumbsUp, Trash2, Zap } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, isPast, isToday } from "date-fns";
import { toast } from "sonner";
import { PropertyCard } from "@/components/PropertyCard";
import { paymentPreferenceLabel } from "@/lib/paymentOptions";

import { cn } from "@/lib/utils";

import { CustomerSmsTab } from "@/components/SmsEmbedTab";
import { CustomerCallsTab } from "@/components/CallLogEmbedTab";
import { WorkflowProgressStrip } from "@/components/WorkflowProgressStrip";
import { WorkflowActionBar } from "@/components/WorkflowActionBar";
import { getDefaultSteps } from "@/hooks/useWorkflowDefinitions";
import { useQuery } from "@tanstack/react-query";
import { usePresentationsForEstimate, useResponsesForEstimate } from "@/hooks/useEstimatePresentations";
import { formatDistanceToNow } from "date-fns";

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

// EstimateStatusBadge now uses the shared JobStatusBadge with entityType="estimate"
import { JobStatusBadge } from "@/components/JobStatusBadge";
function EstimateStatusBadge({ status }: { status: string }) {
  return <JobStatusBadge status={status} entityType="estimate" />;
}


function useEstimateEmployees() {
  return useQuery({
    queryKey: ["employees_active"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("*").eq("is_active", true);
      return data || [];
    },
  });
}

const tabTriggerClass = "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm flex items-center gap-1.5";

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: estimate, isLoading } = useEstimate(id);
  const updateStatus = useUpdateEstimateStatus();
  const { data: employees } = useEstimateEmployees();
  const [review, setReview] = useState<EstimateReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  
  const [linkedJobId, setLinkedJobId] = useState<string | null>(null);
  const [convertingToJob, setConvertingToJob] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [deleting, setDeleting] = useState(false);
  const { data: presentations } = usePresentationsForEstimate(id);
  const { data: customerResponses } = useResponsesForEstimate(id);

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

      const { data: linkedJobs } = await supabase
        .from("jobs")
        .select("id")
        .eq("estimate_id", id)
        .limit(1);
      if (linkedJobs && linkedJobs.length > 0) {
        setLinkedJobId(linkedJobs[0].id);
      }
    })();
  }, [id]);

  if (isLoading) return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="p-4 max-w-4xl mx-auto"><Skeleton className="h-40 w-full" /></main>
    </div>
  );

  if (!estimate) return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="p-4 text-center text-muted-foreground">Estimate not found</main>
    </div>
  );

  const reviewConfig = review ? (reviewStatusConfig[review.status] || reviewStatusConfig.pending_review) : null;
  const ws = estimate.work_status || "new";

  /* Build a "job-like" record for the workflow engine */
  const estimateAsJob: Record<string, any> = {
    ...estimate,
    job_type: "estimate",
    status: estimate.work_status || "new",
    customer_name: estimate.customer_name,
    customer_phone: estimate.customer_phone,
  };

  const estimateSteps = getDefaultSteps("estimate");

  /* Stub callbacks for WorkflowActionBar — estimates use the `estimates` table */
  const handleSendForm = (type: "install_checklist" | "techform") => {
    toast.info("Send form from the estimate review flow");
  };
  const handleDispatch = () => {
    toast.info("Dispatch from the estimate workflow");
  };

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="pb-8">
        {/* Header */}
        <div className="p-4 border-b bg-card">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">#{estimate.estimate_number || "—"}</h2>
                <EstimateStatusBadge status={ws} />
              </div>
              <p className="text-sm font-medium">{estimate.customer_name || "Unknown Customer"}</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete estimate #{estimate.estimate_number || "—"} for {estimate.customer_name || "Unknown"}. This action cannot be undone.
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
                        await supabase.from("estimates").delete().eq("id", id!);
                        toast.success("Estimate deleted");
                        navigate(-1);
                      } catch (e: any) {
                        toast.error("Delete failed: " + e.message);
                      } finally {
                        setDeleting(false);
                      }
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete Estimate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {estimate.description && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{estimate.description}</p>
          )}

          <div className="mt-3 space-y-1">
            {estimate.customer_phone && (
              <div className="flex items-center gap-1">
                <ClickToCall phone={estimate.customer_phone} contactName={estimate.customer_name} jobId={estimate.id} className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors" iconClassName="h-3.5 w-3.5 text-muted-foreground shrink-0" />

                <SmsButton phone={estimate.customer_phone} iconClassName="h-3 w-3" />
              </div>
            )}
            {estimate.customer_email && (
              <a href={`mailto:${estimate.customer_email}`} className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{estimate.customer_email}</span>
              </a>
            )}
            {estimate.address && (
              <AddressLink address={estimate.address} className="text-xs text-foreground" />
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {estimate.hcp_id && (
              <a href={`https://pro.housecallpro.com/app/estimates/${estimate.hcp_id}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-primary font-medium">
                <ExternalLink className="h-3.5 w-3.5" /> Open in HCP
              </a>
            )}
            {linkedJobId && (
              <Button variant="default" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate(`/jobs/${linkedJobId}`)}>
                <ArrowRight className="h-3.5 w-3.5" /> View Job
              </Button>
            )}
            <Button
              variant="outline" size="sm" className="text-xs gap-1 h-7"
              onClick={() => {
                const params = new URLSearchParams({ estimate_id: id! });
                if (estimate.customer_name) params.set("customer_name", estimate.customer_name);
                if (estimate.customer_phone) params.set("customer_phone", estimate.customer_phone);
                if (estimate.customer_email) params.set("customer_email", estimate.customer_email || "");
                navigate(`/quick-quote?${params.toString()}`);
              }}
            >
              <Zap className="h-3.5 w-3.5" /> Build Quote
            </Button>
            {ws === "won" && !linkedJobId && (
              <Button
                variant="outline" size="sm" className="text-xs gap-1 h-7"
                disabled={convertingToJob}
                onClick={async () => {
                  setConvertingToJob(true);
                  try {
                    await updateStatus.mutateAsync({ id: id!, status: "won" });
                    const { data: newJobs } = await supabase.from("jobs").select("id").eq("estimate_id", id!).limit(1);
                    if (newJobs && newJobs.length > 0) { setLinkedJobId(newJobs[0].id); toast.success("Job created successfully!"); }
                  } catch (e: any) { toast.error("Failed to create job: " + e.message); }
                  setConvertingToJob(false);
                }}
              >
                {convertingToJob ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                Convert to Job
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground mt-2">
            {estimate.scheduled_date && <>Scheduled: {format(new Date(estimate.scheduled_date + "T00:00:00"), "M/d/yyyy")}</>}
            {estimate.assigned_to && <> · {estimate.assigned_to}</>}
          </div>

          {/* Workflow Action Bar — "What's Next" for estimates */}
          <WorkflowActionBar
            job={estimateAsJob}
            jobId={id!}
            employees={employees}
            onSendForm={handleSendForm}
            onDispatch={handleDispatch}
            dispatching={false}
            workflowSteps={estimateSteps}
            tableName="estimates"
          />
        </div>

        {/* Workflow Progress Strip */}
        <WorkflowProgressStrip job={estimateAsJob} steps={estimateSteps} />

        {/* Property Info Card */}
        {estimate.address && <PropertyCard address={estimate.address} />}

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start px-4 bg-transparent border-b rounded-none h-auto p-0 gap-0">
            <TabsTrigger value="overview" className={tabTriggerClass}><Info className="h-3.5 w-3.5" /> Overview</TabsTrigger>
            
            <TabsTrigger value="sms" className={tabTriggerClass}><Phone className="h-3.5 w-3.5" /> SMS</TabsTrigger>
            <TabsTrigger value="calls" className={tabTriggerClass}><Phone className="h-3.5 w-3.5" /> Calls</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            <div className="px-4 py-4 space-y-4">
              {reviewLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : review ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" /> Estimate Review
                      </CardTitle>
                      <Badge variant={reviewConfig!.variant}>{reviewConfig!.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div><strong>Submitted by:</strong> {review.employee_name}</div>
                    <div><strong>Submitted:</strong> {format(new Date(review.created_at), "MMM d, yyyy h:mm a")}</div>
                    {review.selected_tiers.length > 0 && (
                      <div>
                        <strong>Selected Tiers:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {review.selected_tiers.map(tier => (
                            <Badge key={tier} variant="outline">{tier}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {review.payment_preference && (
                      <div>
                        <strong>Payment Preference:</strong>{" "}
                        {paymentPreferenceLabel(review.payment_preference)}
                      </div>
                    )}
                    {review.reviewed_at && (
                      <div><strong>Reviewed:</strong> {format(new Date(review.reviewed_at), "MMM d, yyyy h:mm a")}</div>
                    )}
                    {review.admin_notes && (
                      <div><strong>Admin Notes:</strong> <span className="italic text-muted-foreground">"{review.admin_notes}"</span></div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="p-6 text-center text-muted-foreground">
                  <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No estimate review submitted yet.</p>
                </Card>
              )}

              {/* Presentation Tracking */}
              {presentations && presentations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Eye className="h-4 w-4" /> Sales Presentation Tracking
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {presentations.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded border">
                        <div>
                          <p className="font-medium">{p.customer_email || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            Sent {format(new Date(p.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div className="text-right">
                          {p.view_count > 0 ? (
                            <>
                              <Badge variant="outline" className="text-xs">
                                <Eye className="h-3 w-3 mr-1" /> {p.view_count} view{p.view_count !== 1 ? "s" : ""}
                              </Badge>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Last viewed {formatDistanceToNow(new Date(p.last_viewed_at!))} ago
                              </p>
                            </>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Not yet viewed</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Customer Responses */}
              {customerResponses && customerResponses.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ThumbsUp className="h-4 w-4" /> Customer Decisions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {customerResponses.map((r) => (
                      <div key={r.id} className={cn(
                        "p-3 rounded border",
                        r.action === "approved" && "border-emerald-200 bg-emerald-50",
                        r.action === "changes_requested" && "border-amber-200 bg-amber-50",
                        r.action === "declined" && "border-red-200 bg-red-50",
                      )}>
                        <div className="flex items-center gap-2">
                          <Badge variant={r.action === "approved" ? "default" : r.action === "declined" ? "destructive" : "secondary"}>
                            {r.action === "approved" ? "✅ Approved" : r.action === "changes_requested" ? "❓ Has Questions" : "❌ Declined"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(r.responded_at), "MMM d, yyyy h:mm a")}
                          </span>
                        </div>
                        {r.action === "approved" && (r as any).selected_tier && (
                          <p className="mt-2 text-sm"><strong>System:</strong> <span className="capitalize">{(r as any).selected_tier}</span></p>
                        )}
                        {r.action === "approved" && r.payment_preference && (
                          <p className="mt-1 text-sm"><strong>Payment:</strong> {paymentPreferenceLabel(r.payment_preference)}</p>
                        )}
                        {r.action === "approved" && (r as any).selected_addons && Array.isArray((r as any).selected_addons) && (r as any).selected_addons.length > 0 && (
                          <p className="mt-1 text-sm"><strong>Add-ons:</strong> {(r as any).selected_addons.join(", ")}</p>
                        )}
                        {r.message && <p className="mt-2 text-sm italic text-muted-foreground">"{r.message}"</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>



          <TabsContent value="sms" className="mt-0">
            {estimate.customer_phone ? (
              <CustomerSmsTab phones={[estimate.customer_phone].filter(Boolean)} />
            ) : (
              <p className="text-center text-muted-foreground py-8">No customer phone on file</p>
            )}
          </TabsContent>

          <TabsContent value="calls" className="mt-0">
            {estimate.customer_phone ? (
              <CustomerCallsTab
                phones={[estimate.customer_phone].filter(Boolean)}
                customerId={estimate.customer_id || undefined}
              />
            ) : (
              <p className="text-center text-muted-foreground py-8">No customer phone on file</p>
            )}
          </TabsContent>
        </Tabs>
      </main>

    </div>
  );
}
