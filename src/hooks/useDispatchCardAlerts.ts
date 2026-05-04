/**
 * useDispatchCardAlerts.ts — Dispatch calendar card alert queries + bucketing
 *
 * SYSTEM CONNECTIONS:
 * - Queries action_items (status='pending', created_at >= APP_ACTION_GO_LIVE_DATE)
 * - Queries workflow_alerts (alert_type IN ('blocked', 'escalated'), resolved_at IS NULL)
 * - Derives alerts from jobs (missing deposit, missing finance paperwork, missing site photos, completion form not sent)
 * - Buckets all results into Map<jobId, DispatchAlert[]> for O(1) lookup on calendar cards
 *
 * SITS ON:
 * - Supabase realtime: action_items, workflow_alerts table changes
 * - TanStack Query for caching + stale management
 * - useRealtimeInvalidation for auto-refresh on realtime events
 *
 * ASSUMPTIONS:
 * - job_type, job_status, payment_method, etc. live on the jobs row
 * - action_items.job_id, workflow_alerts.job_id are foreign keys to jobs.id
 * - 30s stale time is acceptable; realtime invalidation keeps data fresh
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { APP_ACTION_GO_LIVE_ISO, CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";

export type DispatchAlertSeverity = "blocked" | "action" | "info";

export type DispatchAlert = {
  id: string; // unique key for React + RPC target
  source: "action_item" | "workflow_alert" | "derived";
  jobId: string;
  severity: DispatchAlertSeverity;
  label: string; // short human label e.g. "Needs deposit"
  detail?: string; // longer description
  actionLabel?: string; // button label e.g. "Mark deposit received"
  actionKind?: "navigate" | "rpc_resolve" | "rpc_retry" | "rpc_admin_delete";
  actionTarget?: string; // URL for navigate, or RPC arg
  createdAt: string;
};

export function useDispatchCardAlerts() {
  const { data: alertData = { alertsByJobId: new Map(), allAlerts: [] }, isLoading, isError } = useQuery({
    queryKey: ["dispatch-card-alerts"],
    staleTime: 30000,
    queryFn: async () => {
      const errors: string[] = [];

      // Fire three queries in parallel
      const results = await Promise.allSettled([
        // 0: action_items where status='pending' and job_id IS NOT NULL
        supabase
          .from("action_items" as any)
          .select("*")
          .eq("status", "pending")
          .not("job_id", "is", null)
          .gte("created_at", APP_ACTION_GO_LIVE_ISO)
          .order("created_at", { ascending: false })
          .limit(500),

        // 1: workflow_alerts where alert_type IN ('blocked', 'escalated') and resolved_at IS NULL
        supabase
          .from("workflow_alerts" as any)
          .select(`*, jobs:job_id (*)`)
          .in("alert_type", ["blocked", "escalated"])
          .is("resolved_at", null)
          .order("created_at", { ascending: false })
          .limit(500),

        // 2: jobs needing derived alerts (deposit, finance, photos, completion form)
        supabase
          .from("jobs" as any)
          .select("*")
          .not("status", "in", CLOSED_WORK_STATUS_FILTER)
          .not("scheduled_date", "is", null)
          .gte("created_at", APP_ACTION_GO_LIVE_ISO)
          .limit(5000),
      ]);

      const alertsByJobId = new Map<string, DispatchAlert[]>();

      // Process action_items
      if (results[0].status === "fulfilled" && !results[0].value.error) {
        const actionItems = (results[0].value.data || []) as any[];
        for (const item of actionItems) {
          const jobId = item.job_id;
          if (!jobId) continue;

          const metadata = (item.metadata || {}) as any;
          const severity = metadata.urgent === true ? "blocked" : "action";

          const alert: DispatchAlert = {
            id: `action-${item.id}`,
            source: "action_item",
            jobId,
            severity,
            label: item.title || item.category || "Action item",
            detail: item.description || metadata.description,
            actionLabel: "Review action",
            actionKind: "navigate",
            actionTarget: `/now?action_items=1&action_id=${encodeURIComponent(item.id)}`,
            createdAt: item.created_at,
          };

          if (!alertsByJobId.has(jobId)) alertsByJobId.set(jobId, []);
          alertsByJobId.get(jobId)!.push(alert);
        }
      } else if (results[0].status === "rejected") {
        errors.push("action_items");
      }

      // Process workflow_alerts
      if (results[1].status === "fulfilled" && !results[1].value.error) {
        const workflowAlerts = (results[1].value.data || []) as any[];
        for (const alert of workflowAlerts) {
          const jobId = alert.job_id;
          if (!jobId) continue;

          const dispatchAlert: DispatchAlert = {
            id: `alert-${alert.id}`,
            source: "workflow_alert",
            jobId,
            severity: "blocked",
            label: `Blocked: ${alert.step_id || "workflow"}`,
            detail: alert.message || alert.details?.reason,
            actionLabel: "Retry workflow",
            actionKind: "rpc_retry",
            actionTarget: alert.id,
            createdAt: alert.created_at,
          };

          if (!alertsByJobId.has(jobId)) alertsByJobId.set(jobId, []);
          alertsByJobId.get(jobId)!.push(dispatchAlert);
        }
      } else if (results[1].status === "rejected") {
        errors.push("workflow_alerts");
      }

      // Process jobs for derived alerts
      if (results[2].status === "fulfilled" && !results[2].value.error) {
        const jobs = (results[2].value.data || []) as any[];
        for (const job of jobs) {
          const derived: DispatchAlert[] = [];

          // Deposit needed: job_type='install', deposit_paid_at IS NULL, payment_method != 'financed'
          if (
            job.job_type === "install" &&
            !job.deposit_paid_at &&
            job.payment_method !== "financed"
          ) {
            derived.push({
              id: `derived-deposit-${job.id}`,
              source: "derived",
              jobId: job.id,
              severity: "action",
              label: "Needs deposit",
              detail: "Collect deposit payment to proceed",
              actionLabel: "Mark deposit received",
              actionKind: "rpc_resolve",
              actionTarget: job.id,
              createdAt: job.created_at,
            });
          }

          // Finance paperwork: job_type='install', payment_method='financed', finance_paperwork_at IS NULL
          if (
            job.job_type === "install" &&
            job.payment_method === "financed" &&
            !job.finance_paperwork_at
          ) {
            derived.push({
              id: `derived-finance-${job.id}`,
              source: "derived",
              jobId: job.id,
              severity: "action",
              label: "Finance paperwork pending",
              detail: "Complete financing application",
              actionLabel: "Mark completed",
              actionKind: "rpc_resolve",
              actionTarget: job.id,
              createdAt: job.created_at,
            });
          }

          // Missing site photos: site_visit_missing=true, photos_uploaded_at IS NULL
          if (job.site_visit_missing && !job.photos_uploaded_at) {
            derived.push({
              id: `derived-photos-${job.id}`,
              source: "derived",
              jobId: job.id,
              severity: "action",
              label: "Site photos needed",
              detail: "Upload before/after photos from site visit",
              actionLabel: "Upload photos",
              actionKind: "navigate",
              actionTarget: `/jobs/${job.id}`,
              createdAt: job.created_at,
            });
          }

          // Completion form not sent: status='done', completion_form_sent_at IS NULL
          if (job.status === "done" && !job.completion_form_sent_at) {
            derived.push({
              id: `derived-completion-${job.id}`,
              source: "derived",
              jobId: job.id,
              severity: "action",
              label: "Completion form pending",
              detail: "Send completion form to customer",
              actionLabel: "Send form",
              actionKind: "navigate",
              actionTarget: `/jobs/${job.id}`,
              createdAt: job.created_at,
            });
          }

          if (derived.length > 0) {
            if (!alertsByJobId.has(job.id)) alertsByJobId.set(job.id, []);
            alertsByJobId.get(job.id)!.push(...derived);
          }
        }
      } else if (results[2].status === "rejected") {
        errors.push("jobs");
      }

      // Convert to array for logging if needed
      const allAlerts = Array.from(alertsByJobId.values()).flat();

      if (errors.length > 0) {
        console.warn(`[useDispatchCardAlerts] ${errors.length} query/queries failed:`, errors);
      }

      return {
        alertsByJobId,
        allAlerts,
      };
    },
  });

  // Realtime invalidation on action_items and workflow_alerts changes
  useRealtimeInvalidation(
    [
      { table: "action_items", queryKeys: [["dispatch-card-alerts"]] },
      { table: "workflow_alerts", queryKeys: [["dispatch-card-alerts"]] },
      { table: "jobs", queryKeys: [["dispatch-card-alerts"]] },
    ],
    "dispatch-card-alerts-realtime"
  );

  return {
    alertsByJobId: alertData.alertsByJobId,
    isLoading,
    isError,
  };
}
