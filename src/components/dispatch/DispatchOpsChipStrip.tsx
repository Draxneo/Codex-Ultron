/**
 * DispatchOpsChipStrip.tsx — Horizontal row of non-customer ops alerts
 *
 * SYSTEM: Small chip row across the top of Dispatch HQ showing 0-4 ops alerts:
 *   - Unmatched invoices (HCP invoice review queue)
 *   - Payment failures (Stripe declines on active jobs)
 *   - Tech proposals (estimate_reviews awaiting approval)
 *   - Outbox total (pending emails + SMS drafts)
 *
 * BEHAVIOR: Only shows chips with count > 0. Each chip is clickable and navigates
 * to a focused queue page (invoices, payments, proposals, etc.).
 *
 * DATA SOURCE: useDispatchOpsChips() hook — queries 4 ops counts from DB.
 *
 * SITS ON: Top of DispatchCalendar main content, above calendar header.
 *
 * STYLING: Horizontal flex row, small pills with neutral borders, hover pop effect.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useNavigate } from "react-router-dom";
import { APP_ACTION_GO_LIVE_ISO, CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";
import { AlertTriangle, FileText, CreditCard, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface OpsChipData {
  unmatchedInvoices: number;
  paymentFailures: number;
  techProposals: number;
  outboxTotal: number;
  errors: string[];
}

/**
 * useDispatchOpsChips — Fetches 4 ops alert counts
 *
 * Uses Promise.allSettled so one failure doesn't crash the strip.
 * Returns 0 for failed queries and tracks errors.
 */
function useDispatchOpsChips(): OpsChipData & { isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dispatch-ops-chips"],
    staleTime: 30000, // 30s stale time
    queryFn: async () => {
      const errors: string[] = [];

      // Fire all 4 queries simultaneously
      const results = await Promise.allSettled([
        // 0: Unmatched invoices (HCP invoice match_status='pending_review')
        supabase.from("job_invoices").select("id", { count: "exact", head: true }).eq("match_status", "pending_review"),

        // 1: Payment failures (jobs.last_payment_error IS NOT NULL, not closed)
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .not("last_payment_error", "is", null)
          .not("status", "in", CLOSED_WORK_STATUS_FILTER)
          .gte("created_at", APP_ACTION_GO_LIVE_ISO),

        // 2: Tech proposals (estimate_reviews.status='pending_review')
        supabase.from("estimate_reviews").select("id", { count: "exact", head: true }).eq("status", "pending_review"),

        // 3: Outbox total pending (outbound_drafts.status='pending')
        supabase
          .from("outbound_drafts")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .gte("created_at", APP_ACTION_GO_LIVE_ISO),
      ]);

      const unmatchedInvoices = results[0].status === "fulfilled" ? (results[0].value.count ?? 0) : (errors.push("Unmatched Invoices"), 0);
      const paymentFailures = results[1].status === "fulfilled" ? (results[1].value.count ?? 0) : (errors.push("Payment Failures"), 0);
      const techProposals = results[2].status === "fulfilled" ? (results[2].value.count ?? 0) : (errors.push("Tech Proposals"), 0);
      const outboxTotal = results[3].status === "fulfilled" ? (results[3].value.count ?? 0) : (errors.push("Outbox Total"), 0);

      return { unmatchedInvoices, paymentFailures, techProposals, outboxTotal, errors };
    },
  });

  // Realtime invalidation
  useRealtimeInvalidation({
    tables: ["job_invoices", "jobs", "estimate_reviews", "outbound_drafts"],
    onInvalidate: () => {
      // Parent will handle query invalidation
    },
    queryKey: "dispatch-ops-chips",
  });

  return {
    unmatchedInvoices: data?.unmatchedInvoices ?? 0,
    paymentFailures: data?.paymentFailures ?? 0,
    techProposals: data?.techProposals ?? 0,
    outboxTotal: data?.outboxTotal ?? 0,
    errors: data?.errors ?? [],
    isLoading,
    isError,
  };
}

/**
 * OpsChip — individual clickable chip
 */
function OpsChip({
  label,
  count,
  icon: Icon,
  onClick,
  color = "text-slate-600",
}: {
  label: string;
  count: number;
  icon: React.ElementType;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
        "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:scale-95",
        "dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:border-slate-500"
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span>{count}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

interface DispatchOpsChipStripProps {
  className?: string;
}

/**
 * DispatchOpsChipStrip — main component
 */
export function DispatchOpsChipStrip({ className }: DispatchOpsChipStripProps) {
  const navigate = useNavigate();
  const { unmatchedInvoices, paymentFailures, techProposals, outboxTotal, isLoading } = useDispatchOpsChips();

  // Hide entire strip if all counts are 0 and not loading
  const hasAnyAlerts = unmatchedInvoices > 0 || paymentFailures > 0 || techProposals > 0 || outboxTotal > 0;

  if (!hasAnyAlerts && !isLoading) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-2 pt-3 px-4", className)}>
      {/* Unmatched Invoices */}
      {unmatchedInvoices > 0 && (
        <OpsChip
          label="Invoices"
          count={unmatchedInvoices}
          icon={FileText}
          color="text-amber-600"
          onClick={() => navigate("/admin?section=integrations")}
        />
      )}

      {/* Payment Failures */}
      {paymentFailures > 0 && (
        <OpsChip
          label="Payment Failures"
          count={paymentFailures}
          icon={AlertTriangle}
          color="text-red-600"
          onClick={() => navigate("/payments")}
        />
      )}

      {/* Tech Proposals */}
      {techProposals > 0 && (
        <OpsChip
          label="Tech Proposals"
          count={techProposals}
          icon={FileText}
          color="text-blue-600"
          onClick={() => navigate("/quick-quote")}
        />
      )}

      {/* Outbox Total */}
      {outboxTotal > 0 && (
        <OpsChip
          label="Outbox"
          count={outboxTotal}
          icon={Send}
          color="text-violet-600"
          onClick={() => navigate("/now")} // Will redirect to /dispatch in future
        />
      )}

      {/* Loading skeleton — show minimal pulse if data is loading */}
      {isLoading && unmatchedInvoices === 0 && paymentFailures === 0 && techProposals === 0 && outboxTotal === 0 && (
        <div className="flex gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-7 w-16 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
      )}
    </div>
  );
}
