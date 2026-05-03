import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Layers3,
  Loader2,
  Plus,
  Printer,
  Send,
  Trash2,
  User2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
import {
  useEstimateApprovalEvents,
  usePresentationsForEstimate,
  useRecordVerbalEstimateApproval,
  useResponsesForEstimate,
  type EstimateApprovalEvent,
} from "@/hooks/useEstimatePresentations";
import { useIsMobile } from "@/hooks/use-mobile";
import { getExpectedJobItems } from "@/lib/expectedJobItems";
import { paymentPreferenceLabel } from "@/lib/paymentOptions";
import { errorMessage } from "@/lib/errorMessage";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { cn } from "@/lib/utils";
import { DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_SHORT_NAME } from "@/lib/companyDefaults";
import { TechCollapsibleCard } from "@/components/tech/TechCollapsibleCard";
import { TechCustomerCard } from "@/components/tech/TechCustomerCard";
import { EstimateCartStatus } from "@/components/EstimateCartStatus";
import { EstimateEditDialog } from "@/components/estimate/EstimateEditDialog";
import { EstimatePhotosCard } from "@/components/estimate/EstimatePhotosCard";
import { AskJarvisButton } from "@/components/jarvis/AskJarvisButton";
import { Image as ImageIcon } from "lucide-react";

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

interface EstimateLineItem {
  id: string;
  option_name: string | null;
  hcp_option_id: string | null;
  name: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  unit_cost: number | null;
  total_price: number | null;
  tax_amount: number | null;
  kind: string | null;
  item_type: string | null;
  sort_order: number | null;
}

function money(value: number | null | undefined) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function EstimateOptionsWorkbench({
  estimateId,
  linkedJobId,
  presentationUrl,
  onBuildQuote,
}: {
  estimateId: string;
  linkedJobId: string | null;
  presentationUrl: string | null;
  onBuildQuote: () => void;
}) {
  const [activeOptionKey, setActiveOptionKey] = useState<string | null>(null);
  const { data: lineItems, isLoading, isError: lineItemsError, error: lineItemsQueryError } = useQuery({
    queryKey: ["estimate_line_items", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_line_items" as any)
        .select("id, option_name, hcp_option_id, name, description, quantity, unit_price, unit_cost, total_price, tax_amount, kind, item_type, sort_order")
        .eq("estimate_id", estimateId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EstimateLineItem[];
    },
  });

  const options = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; items: EstimateLineItem[] }>();
    (lineItems || []).forEach((item, index) => {
      const key = item.hcp_option_id || item.option_name || "option-1";
      const label = item.option_name || (key === "option-1" ? "Option #1" : `Option #${index + 1}`);
      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
      groups.get(key)!.items.push(item);
    });
    if (groups.size === 0) return [{ key: "option-1", label: "Option #1", items: [] as EstimateLineItem[] }];
    return Array.from(groups.values());
  }, [lineItems]);

  const activeOption = options.find((option) => option.key === activeOptionKey) || options[0];

  useEffect(() => {
    if (!activeOptionKey && options[0]) setActiveOptionKey(options[0].key);
  }, [activeOptionKey, options]);

  const subtotal = activeOption.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const tax = activeOption.items.reduce((sum, item) => sum + Number(item.tax_amount || 0), 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Layers3 className="h-4 w-4" /> Options
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Build the comfort presentation first, then carry the selected option into the cart and job.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={onBuildQuote}>
            <Plus className="h-3.5 w-3.5" /> New option
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={onBuildQuote}>
            <BookOpen className="h-3.5 w-3.5" /> Price book
          </Button>
          {presentationUrl && (
            <Button size="sm" className="h-8" onClick={() => window.open(presentationUrl, "_blank", "noopener,noreferrer")}>
              <FileText className="h-3.5 w-3.5" /> Present
            </Button>
          )}
        </div>
      </div>

      <div className="border-b bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const optionTotal = option.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
            const active = option.key === activeOption.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveOptionKey(option.key)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  active ? "border-primary bg-background text-primary shadow-sm" : "border-border bg-background hover:bg-accent",
                )}
              >
                <span className="block font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.items.length ? `${option.items.length} items · ${money(optionTotal)}` : "No line items yet"}
                </span>
                {linkedJobId && active && (
                  <span className="mt-1 block text-[11px] font-medium text-emerald-700">Copied to job</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {lineItemsError ? (
        <div className="m-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Estimate options did not load.</p>
              <p className="mt-1 text-xs leading-relaxed">
                {errorMessage(lineItemsQueryError)}. Refresh before presenting or converting this estimate.
              </p>
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : activeOption.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Item</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Qty</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Unit</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {activeOption.items.map((item) => (
                <tr key={item.id} className="border-t bg-background">
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.name || "Line item"}</div>
                    {item.description && (
                      <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    )}
                    {(item.kind || item.item_type) && (
                      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {[item.kind, item.item_type].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{Number(item.quantity || 1)}</td>
                  <td className="px-3 py-3 text-right">{money(item.unit_price)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{money(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto w-full max-w-sm space-y-1 border-t px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{money(subtotal)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">{money(tax)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-bold">
              <span>Total</span>
              <span>{money(subtotal + tax)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-sm font-medium">No option line items yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with the system presentation, then attach the selected equipment, add-ons, and repair options.
          </p>
          <Button className="mt-4" onClick={onBuildQuote}>
            <Plus className="h-4 w-4" /> Build option
          </Button>
        </div>
      )}
    </Card>
  );
}

function EstimateActionBar({
  estimate,
  estimateId,
  linkedJobId,
  customerName,
  customerPhone,
  customerEmail,
  latestPresentationToken,
  converting,
  onConvert,
  onVerbalApprove,
  verbalApproving,
  jarvisContext,
}: {
  estimate: any;
  estimateId: string;
  linkedJobId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  latestPresentationToken?: string | null;
  converting: boolean;
  onConvert: () => void;
  onVerbalApprove: () => void;
  verbalApproving?: boolean;
  jarvisContext: Record<string, any>;
}) {
  const navigate = useNavigate();
  const scheduleSub = estimate?.scheduled_date
    ? `${format(new Date(`${estimate.scheduled_date}T00:00:00`), "MMM d")}${estimate.arrival_start ? ` - ${estimate.arrival_start}` : ""}`
    : "Not scheduled";

  const quoteParams = new URLSearchParams({ estimate_id: estimateId });
  if (customerName) quoteParams.set("customer_name", customerName);
  if (customerPhone) quoteParams.set("customer_phone", customerPhone);
  if (customerEmail) quoteParams.set("customer_email", customerEmail);
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
        <button type="button" className={actionClass} onClick={() => navigate(`/records/estimate/${estimateId}`)}>
          <FileText className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Document</span>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">Clean view</span>
        </button>
        <button
          type="button"
          className={customerPhone ? actionClass : disabledActionClass}
          disabled={!customerPhone}
          onClick={() => {
            if (!customerPhone) return;
            const firstName = String(customerName || "").split(" ")[0] || "there";
            const body = presentationUrl
              ? `Hi ${firstName}, here is your estimate from ${DEFAULT_COMPANY_NAME}: ${presentationUrl}`
              : `Hi ${firstName}, your ${DEFAULT_COMPANY_SHORT_NAME} estimate is ready. I will send the proposal link shortly.`;
            openSmsComposer(customerPhone, {
              contactName: customerName,
              customerId: estimate.customer_id || undefined,
              draft: body,
            });
          }}
        >
          <Send className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">Send</span>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">
            {customerPhone ? "Draft SMS" : "No phone"}
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
        <button type="button" className={actionClass} disabled={verbalApproving} onClick={onVerbalApprove}>
          {verbalApproving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ClipboardCheck className="h-5 w-5" />}
          <span className="text-xs font-semibold uppercase tracking-wide">Verbal OK</span>
          <span className="text-center text-[10px] leading-tight text-muted-foreground">Customer said yes</span>
        </button>
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
        <AskJarvisButton
          contextType="estimate"
          contextId={estimateId}
          label="Ask JARVIS"
          context={jarvisContext}
          variant="outline"
          className={actionClass}
          stopPropagation={false}
        />
      </div>
    </Card>
  );
}

function MobileActionPill({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 text-[11px] font-semibold text-foreground disabled:opacity-50 active:bg-muted"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ApprovalCustodyCard({
  estimate,
  linkedJobId,
  events,
}: {
  estimate: any;
  linkedJobId: string | null;
  events: EstimateApprovalEvent[];
}) {
  const latest = events[0];
  const sourceJobId = estimate?.source_job_id || null;
  const approvedAt = latest?.approved_at || estimate?.customer_approved_at || null;
  const method = latest?.approval_method || estimate?.approval_method || null;
  const label = estimate?.authorized_work_label || estimate?.estimate_number || "Not assigned yet";
  const status = latest?.approval_status || estimate?.approval_status || (estimate?.customer_approved_at ? "approved" : "pending");

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
          <ClipboardCheck className="h-4 w-4" /> Approval Custody
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Status</p>
            <p className="mt-1 font-semibold capitalize">{String(status).replace(/_/g, " ")}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Approval</p>
            <p className="mt-1 font-semibold capitalize">{method ? String(method).replace(/_/g, " ") : "Not approved yet"}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Work label</p>
            <p className="mt-1 font-semibold">{label}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Attached to</p>
            <p className="mt-1 font-semibold">{sourceJobId ? "Original job" : linkedJobId ? "Converted job" : "Quote only"}</p>
          </div>
        </div>

        <div className="rounded-md border p-3">
          <p className="font-medium">Rule</p>
          <p className="mt-1 text-muted-foreground">
            This quote is proposed work until the customer approves it digitally or someone records a verbal approval.
            Once approved, it becomes authorized work with this approval trail attached.
          </p>
        </div>

        {approvedAt ? (
          <div className="space-y-2">
            {events.length > 0 ? events.map((event) => (
              <div key={event.id} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold capitalize">
                    {event.approval_method} approval - {event.approval_status.replace(/_/g, " ")}
                  </p>
                  <span className="text-xs text-muted-foreground">{format(new Date(event.approved_at), "MMM d, yyyy h:mm a")}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.actor_type === "customer" ? "Customer approved from the public link." : `Recorded by ${event.recorded_by_name || "office user"}.`}
                </p>
                {event.selected_option_key && <p className="mt-1"><strong>Option:</strong> {event.selected_option_key}</p>}
                {event.payment_method && <p className="mt-1"><strong>Payment:</strong> {paymentPreferenceLabel(event.payment_method)}</p>}
                {event.note && <p className="mt-2 italic text-muted-foreground">"{event.note}"</p>}
              </div>
            )) : (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="font-semibold">Approved</p>
                <p className="mt-1 text-xs text-muted-foreground">{format(new Date(approvedAt), "MMM d, yyyy h:mm a")}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="font-semibold">No approval recorded yet</p>
            <p className="mt-1 text-muted-foreground">
              Send the proposal link, or use Verbal OK if the customer gives permission out loud.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VerbalApprovalDialog({
  open,
  onOpenChange,
  note,
  onNoteChange,
  customerName,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: string;
  onNoteChange: (note: string) => void;
  customerName: string;
  saving: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Record verbal approval</AlertDialogTitle>
          <AlertDialogDescription>
            Use this when {customerName || "the customer"} says yes out loud instead of approving from the link.
            This stamps the quote as customer-approved and saves who recorded it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="verbal-approval-note">
            Approval note
          </label>
          <Textarea
            id="verbal-approval-note"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Customer verbally approved the proposed work while we were on site."
            className="min-h-24"
          />
          <p className="text-xs text-muted-foreground">
            This does not fake a digital signature. It records that the approval was spoken and logged by the office or technician.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={saving} onClick={onConfirm}>
            {saving ? "Recording..." : "Record verbal approval"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EstimateDataWarning({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Estimate opened, but part of the customer picture did not load.</p>
          <p className="mt-1 text-xs leading-relaxed">
            Missing {issues.join(", ")}. Refresh before texting, presenting, approving, or converting this estimate.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: estimate, isLoading, isError: estimateError, error: estimateQueryError } = useEstimate(id);
  const { data: linkedCustomer, isError: customerError, error: customerQueryError } = useCustomer(estimate?.customer_id || undefined);
  const updateStatus = useUpdateEstimateStatus();
  const [review, setReview] = useState<EstimateReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [linkedJobId, setLinkedJobId] = useState<string | null>(null);
  const [convertingToJob, setConvertingToJob] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [verbalApprovalOpen, setVerbalApprovalOpen] = useState(false);
  const [verbalApprovalNote, setVerbalApprovalNote] = useState("Customer verbally approved the proposed work.");
  const { data: presentations, isError: presentationsError, error: presentationsQueryError } = usePresentationsForEstimate(id);
  const { data: customerResponses, isError: responsesError, error: responsesQueryError } = useResponsesForEstimate(id);
  const { data: approvalEvents = [] } = useEstimateApprovalEvents(id);
  const recordVerbalApproval = useRecordVerbalEstimateApproval();
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

  if (estimateError || !estimate || !id) {
    return (
      <div className="min-h-screen bg-background">
        {!isMobile && <AppHeader />}
        <main className="p-4 text-center text-muted-foreground">
          {estimateQueryError ? errorMessage(estimateQueryError) : "Estimate not found"}
        </main>
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
  const jarvisEstimateContext = {
    id,
    source: "estimate_detail",
    record_type: "estimate",
    customer_id: estimate.customer_id,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    address: customerAddress,
    estimate_number: estimate.estimate_number,
    status,
    assigned_to: estimate.assigned_to,
    scheduled_date: estimate.scheduled_date,
    arrival_start: (estimate as any).arrival_start,
    arrival_end: (estimate as any).arrival_end,
    description: estimate.description,
    linked_job_id: linkedJobId,
    latest_presentation_token: latestPresentationToken,
    suggested_actions: [
      "Summarize this estimate",
      "Tell me what is needed to approve or convert it",
      "Draft a customer follow-up SMS for human approval",
    ],
  };
  const estimateQuoteParams = new URLSearchParams({ estimate_id: id });
  if (customerName) estimateQuoteParams.set("customer_name", customerName);
  if (customerPhone) estimateQuoteParams.set("customer_phone", customerPhone);
  if (customerEmail) estimateQuoteParams.set("customer_email", customerEmail);
  const buildEstimateOption = () => navigate(`/quick-quote?${estimateQuoteParams.toString()}`);
  const desktopPresentationUrl = latestPresentationToken ? `${window.location.origin}/presentation/${latestPresentationToken}` : null;
  const estimateDataIssues = [
    customerError ? `customer details (${errorMessage(customerQueryError)})` : null,
    presentationsError ? `presentation links (${errorMessage(presentationsQueryError)})` : null,
    responsesError ? `customer approval responses (${errorMessage(responsesQueryError)})` : null,
  ].filter(Boolean);

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

  const handleRecordVerbalApproval = async () => {
    try {
      await recordVerbalApproval.mutateAsync({
        estimate_id: id,
        note: verbalApprovalNote.trim() || "Customer verbally approved the proposed work.",
        recorded_by_name: "Office",
      });
      toast.success("Verbal approval recorded", {
        description: "The customer approval trail is now stamped on this quote.",
      });
      setVerbalApprovalOpen(false);
    } catch (e: any) {
      toast.error("Could not record verbal approval", { description: e?.message || String(e) });
    }
  };

  if (isMobile) {
    const estimateNumber = estimate.estimate_number || "-";
    const jobCount = linkedJobId ? 1 : undefined;
    const quoteParams = new URLSearchParams({ estimate_id: id });
    if (customerName) quoteParams.set("customer_name", customerName);
    if (customerPhone) quoteParams.set("customer_phone", customerPhone);
    if (customerEmail) quoteParams.set("customer_email", customerEmail);
    const presentationUrl = latestPresentationToken ? `/presentation/${latestPresentationToken}` : null;

    return (
      <div className="flex min-h-full flex-col bg-background pb-24">
        <header className="sticky top-0 z-20 flex h-12 items-center border-b border-border bg-card px-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-sm font-semibold text-foreground">Estimate {estimateNumber}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label="More">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete estimate #{estimateNumber} for {customerName}. This action cannot be undone.
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
        </header>

        <div className="sticky top-12 z-10 flex h-11 items-center gap-1 overflow-x-auto border-b border-border bg-card px-2">
          <MobileActionPill icon={Zap} label="Build" onClick={() => navigate(`/quick-quote?${quoteParams.toString()}`)} />
          <MobileActionPill
            icon={Send}
            label="Send"
            disabled={!customerPhone}
            onClick={() => {
              if (!customerPhone) return;
              const firstName = String(customerName || "").split(" ")[0] || "there";
              const body = presentationUrl
                ? `Hi ${firstName}, here is your estimate from ${DEFAULT_COMPANY_NAME}: ${window.location.origin}${presentationUrl}`
                : `Hi ${firstName}, your ${DEFAULT_COMPANY_SHORT_NAME} estimate is ready. I will send the proposal link shortly.`;
              openSmsComposer(customerPhone, {
                contactName: customerName,
                customerId: estimate.customer_id || undefined,
                draft: body,
              });
            }}
          />
          <MobileActionPill icon={ArrowRight} label={linkedJobId ? "Job" : "Convert"} onClick={linkedJobId ? () => navigate(`/jobs/${linkedJobId}`) : handleConvert} />
          <MobileActionPill icon={ClipboardCheck} label="Verbal OK" onClick={() => setVerbalApprovalOpen(true)} disabled={recordVerbalApproval.isPending} />
          {presentationUrl && <MobileActionPill icon={FileText} label="View" onClick={() => window.open(presentationUrl, "_blank", "noopener")} />}
          {estimate.hcp_id && (
            <a
              href={`https://pro.housecallpro.com/app/estimates/${estimate.hcp_id}`}
              target="_blank"
              rel="noopener"
              className="ml-auto flex h-8 items-center gap-1 rounded px-2 text-[11px] font-medium text-primary hover:bg-primary/10"
            >
              HCP
            </a>
          )}
        </div>

        <main className="mx-auto w-full max-w-2xl space-y-3 px-3 pt-3">
          <EstimateDataWarning issues={estimateDataIssues} />

          <TechCollapsibleCard icon={User2} title="Customer" iconBg="bg-blue-500/10" iconColor="text-blue-500" collapsible={false}>
            <TechCustomerCard
              customerId={estimate.customer_id || null}
              customerName={customerName}
              customerPhone={customerPhone || null}
              customerEmail={customerEmail || null}
              address={customerAddress || null}
              jobCount={jobCount}
              hcpCustomerId={linkedCustomer?.hcp_customer_id || null}
              bare
            />
          </TechCollapsibleCard>

          <TechCollapsibleCard icon={CalendarClock} title="Schedule" iconBg="bg-indigo-500/10" iconColor="text-indigo-500">
            <div className="space-y-2.5 p-4 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span>{estimate.scheduled_date ? format(new Date(`${estimate.scheduled_date}T00:00:00`), "EEE, MMM d") : "Not scheduled"}</span>
              </div>
              {((estimate as any).arrival_start || (estimate as any).arrival_end) && (
                <div className="flex items-center gap-2 text-foreground">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {(estimate as any).arrival_start ? format(new Date((estimate as any).arrival_start), "h:mm a") : ""}
                    {(estimate as any).arrival_start && (estimate as any).arrival_end ? " - " : ""}
                    {(estimate as any).arrival_end ? format(new Date((estimate as any).arrival_end), "h:mm a") : ""}
                  </span>
                </div>
              )}
              {estimate.assigned_to && (
                <div className="flex items-center gap-2 text-foreground">
                  <User2 className="h-4 w-4 text-muted-foreground" />
                  <span>{estimate.assigned_to}</span>
                </div>
              )}
            </div>
          </TechCollapsibleCard>

          <ExpectedItemsCard
            items={expectedItems}
            subtitle="Estimate flow: schedule, build options, send, approve, convert."
            quickActions={(item) => {
              if (item.key === "quote_built") {
                return { label: "Build", run: () => navigate(`/quick-quote?${quoteParams.toString()}`) };
              }
              if (item.key === "customer_decision") {
                return { label: "Won", busy: updateStatus.isPending, run: handleConvert };
              }
              return null;
            }}
          />

          <ApprovalCustodyCard estimate={estimate} linkedJobId={linkedJobId} events={approvalEvents} />

          <EstimateCartStatus estimateId={id} customerPhone={customerPhone || undefined} customerName={customerName} />

          {/* Photos: shows every job_attachments row linked to this estimate via estimate_id.
              Surfaces customer-sent MMS images (e.g. carport photos) directly on the estimate
              page so the rep doesn't have to dig through SMS history. */}
          <TechCollapsibleCard icon={ImageIcon} title="Photos" iconBg="bg-rose-500/10" iconColor="text-rose-500" defaultOpen={true}>
            <EstimatePhotosCard estimateId={id!} />
          </TechCollapsibleCard>

          <TechCollapsibleCard icon={FileText} title="Summary" iconBg="bg-slate-500/10" iconColor="text-slate-500" defaultOpen={false}>
            <WorkSummaryCard description={estimate.description} />
          </TechCollapsibleCard>

          <TechCollapsibleCard icon={ClipboardCheck} title="Review" iconBg="bg-emerald-500/10" iconColor="text-emerald-500" defaultOpen={false}>
            <div className="p-4">
              {reviewLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : review ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Submitted by {review.employee_name}</span>
                    {reviewConfig && <Badge variant={reviewConfig.variant}>{reviewConfig.label}</Badge>}
                  </div>
                  {review.selected_tiers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {review.selected_tiers.map((tier) => <Badge key={tier} variant="outline">{tier}</Badge>)}
                    </div>
                  )}
                  {review.admin_notes && <p className="italic text-muted-foreground">"{review.admin_notes}"</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No estimate review submitted yet.</p>
              )}
            </div>
          </TechCollapsibleCard>

          <TechCollapsibleCard icon={FileText} title="Proposal" iconBg="bg-amber-500/10" iconColor="text-amber-500" defaultOpen={false}>
            <div className="space-y-2 p-4">
              {presentationUrl ? (
                <Button className="w-full" onClick={() => window.open(presentationUrl, "_blank", "noopener")}>
                  <FileText className="h-4 w-4" /> Open customer proposal
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">No customer proposal has been built yet.</p>
              )}
            </div>
          </TechCollapsibleCard>

          <TechCollapsibleCard icon={Zap} title="Ask JARVIS" iconBg="bg-purple-500/10" iconColor="text-purple-500" collapsible={false}>
            <div className="p-4">
              <AskJarvisButton
                contextType="estimate"
                contextId={id}
                label="Ask JARVIS about this estimate"
                context={jarvisEstimateContext}
                variant="default"
                size="lg"
                className="h-14 w-full rounded-xl"
                stopPropagation={false}
              />
            </div>
          </TechCollapsibleCard>
        </main>
        <VerbalApprovalDialog
          open={verbalApprovalOpen}
          onOpenChange={setVerbalApprovalOpen}
          note={verbalApprovalNote}
          onNoteChange={setVerbalApprovalNote}
          customerName={customerName}
          saving={recordVerbalApproval.isPending}
          onConfirm={handleRecordVerbalApproval}
        />
      </div>
    );
  }

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
        actions={<EstimateEditDialog estimate={estimate} />}
      />

      <main className="mx-auto max-w-[1600px] px-6 py-4">
        <EstimateDataWarning issues={estimateDataIssues} />

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
              customerName={customerName}
              customerPhone={customerPhone}
              customerEmail={customerEmail}
              latestPresentationToken={latestPresentationToken}
              converting={convertingToJob || updateStatus.isPending}
              onConvert={handleConvert}
              onVerbalApprove={() => setVerbalApprovalOpen(true)}
              verbalApproving={recordVerbalApproval.isPending}
              jarvisContext={jarvisEstimateContext}
            />

            <ExpectedItemsCard
              items={expectedItems}
              subtitle="Estimate flow: schedule, build options, send, approve, convert."
              quickActions={(item) => {
                if (item.key === "quote_built") {
                  return {
                    label: "Build",
                    run: buildEstimateOption,
                  };
                }
                if (item.key === "customer_decision") {
                  return { label: "Won", busy: updateStatus.isPending, run: handleConvert };
                }
                return null;
              }}
            />

            <WorkSummaryCard description={estimate.description} />

            <ApprovalCustodyCard estimate={estimate} linkedJobId={linkedJobId} events={approvalEvents} />

            {/* Customer-sent photos (e.g. MMS images) tied to this estimate via job_attachments.estimate_id.
                Mirrors the Photos card in the mobile/tech view. Wrapped in a Card so it matches the
                desktop layout's visual rhythm. */}
            <Card>
              <CardHeader className="border-b py-3">
                <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                  <ImageIcon className="h-4 w-4" /> Photos
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <EstimatePhotosCard estimateId={id!} />
              </CardContent>
            </Card>

            <EstimateOptionsWorkbench
              estimateId={id}
              linkedJobId={linkedJobId}
              presentationUrl={desktopPresentationUrl}
              onBuildQuote={buildEstimateOption}
            />

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
      <VerbalApprovalDialog
        open={verbalApprovalOpen}
        onOpenChange={setVerbalApprovalOpen}
        note={verbalApprovalNote}
        onNoteChange={setVerbalApprovalNote}
        customerName={customerName}
        saving={recordVerbalApproval.isPending}
        onConfirm={handleRecordVerbalApproval}
      />
    </div>
  );
}
