/**
 * useDispatchCardAlertActions.ts — Dispatch card alert action mutations
 *
 * SYSTEM CONNECTIONS:
 * - Calls acknowledge_workflow_card_once RPC for action_item source (like NowHQ)
 * - Calls resolve_workflow_alert_once RPC for workflow_alert source (like NowHQ)
 * - Calls retry_workflow_alert_once RPC for retry (like NowHQ)
 * - Navigates via useNavigate for "navigate" actionKind
 * - Invalidates ["dispatch-card-alerts"] on success
 * - Shows sonner toast on success/error
 *
 * SITS ON:
 * - Supabase RPC integration (same as NowHQ)
 * - TanStack Query for cache invalidation
 * - useNavigate for routing
 * - useAuth for user.email fallback
 * - sonner toast for notifications
 *
 * PATTERN:
 * - Copies RPC signatures and error handling from NowHQ.tsx exactly
 * - Mutations handle their own busyId state (caller may use isLoading from the mutation)
 * - onSuccess refreshes ["dispatch-card-alerts"] queryKey
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import type { DispatchAlert, DispatchAlertActionKind, DispatchAlertSecondaryAction } from "@/hooks/useDispatchCardAlerts";

export function useDispatchCardAlertActions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Resolve action_item or workflow_alert
  const resolveAlert = useMutation({
    mutationFn: async (alert: DispatchAlert) => {
      if (alert.source === "action_item") {
        // For action_items, call acknowledge_workflow_card_once like NowHQ does
        const { data, error } = await supabase.rpc("acknowledge_workflow_card_once" as any, {
          p_card_id: alert.id,
          p_record_type: "action",
          p_record_id: alert.id.replace("action-", ""),
          p_workflow_type: "intake",
          p_step_key: "review",
          p_note: alert.label,
          p_acknowledged_by_name: user?.email || "Dispatch",
          p_hours: 24,
        });
        if (error) throw error;
        if (data && !(data as any).ok) throw new Error((data as any).reason || "Could not acknowledge this action item.");
        return;
      }

      if (alert.source === "workflow_alert") {
        // For workflow_alerts, call resolve_workflow_alert_once like NowHQ does
        const { data, error } = await supabase.rpc("resolve_workflow_alert_once" as any, {
          p_id: alert.id.replace("alert-", ""),
          p_note: user?.email || "Dispatch",
        });
        if (error) throw error;
        if (data && !(data as any).ok) throw new Error((data as any).reason || "That workflow alert is already handled.");
        return;
      }

      if (alert.source === "derived") {
        // Derived alerts are just informational — mark the job's field as handled
        // For now, we acknowledge the card instead of mutating the job directly
        const { data, error } = await supabase.rpc("acknowledge_workflow_card_once" as any, {
          p_card_id: alert.id,
          p_record_type: "job",
          p_record_id: alert.jobId,
          p_workflow_type: "service",
          p_step_key: "completed",
          p_note: alert.label,
          p_acknowledged_by_name: user?.email || "Dispatch",
          p_hours: 24,
        });
        if (error) throw error;
        if (data && !(data as any).ok) throw new Error((data as any).reason || "Could not acknowledge this alert.");
        return;
      }
    },
    onSuccess: () => {
      toast({ title: "Alert resolved", description: "This alert has been handled." });
      queryClient.invalidateQueries({ queryKey: ["dispatch-card-alerts"] });
    },
    onError: (error) => {
      toast({
        title: "Could not resolve alert",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Retry workflow_alert
  const retryAlert = useMutation({
    mutationFn: async (alert: DispatchAlert) => {
      if (alert.source !== "workflow_alert") {
        throw new Error("Only workflow alerts can be retried.");
      }
      const { data, error } = await supabase.rpc("retry_workflow_alert_once" as any, {
        p_id: alert.id.replace("alert-", ""),
        p_last_error: alert.detail || alert.label,
      });
      if (error) throw error;
      if (data && !(data as any).ok) throw new Error((data as any).reason || "Could not retry this workflow alert.");
    },
    onSuccess: () => {
      toast({ title: "Retry queued", description: "The workflow step will be retried." });
      queryClient.invalidateQueries({ queryKey: ["dispatch-card-alerts"] });
    },
    onError: (error) => {
      toast({
        title: "Retry failed",
        description: error instanceof Error ? error.message : "The alert stayed open.",
        variant: "destructive",
      });
    },
  });

  // Navigate to alert target
  const navigateAlert = (alert: DispatchAlert) => {
    if (alert.actionKind === "navigate" && alert.actionTarget) {
      navigate(alert.actionTarget);
    }
  };

  // 2026-05-04: Direct job-state mutations for derived alerts. Each kind below
  // stamps the relevant timestamp/field on the jobs row, which causes the
  // derived alert's gating condition to flip and the alert to disappear on the
  // next refetch.
  const markDeposit = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase.from("jobs").update({
        deposit_paid_at: new Date().toISOString(),
      }).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Deposit marked received", description: "The job moves forward." });
      queryClient.invalidateQueries({ queryKey: ["dispatch-card-alerts"] });
    },
    onError: (error) => {
      toast({
        title: "Could not mark deposit",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const markFinanced = useMutation({
    mutationFn: async (jobId: string) => {
      // Customer financed (Synchrony etc.) — flip payment_method AND stamp
      // the finance paperwork timestamp so both the deposit alert and the
      // finance paperwork alert clear at once.
      const now = new Date().toISOString();
      const { error } = await supabase.from("jobs").update({
        payment_method: "financed",
        finance_paperwork_at: now,
      }).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Marked as financed", description: "Deposit waived; finance paperwork on file." });
      queryClient.invalidateQueries({ queryKey: ["dispatch-card-alerts"] });
    },
    onError: (error) => {
      toast({
        title: "Could not mark financed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const markCompletionSent = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase.from("jobs").update({
        completion_form_sent_at: new Date().toISOString(),
      }).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Marked sent", description: "Completion form recorded." });
      queryClient.invalidateQueries({ queryKey: ["dispatch-card-alerts"] });
    },
    onError: (error) => {
      toast({
        title: "Could not mark completion form sent",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const markPhotosUploaded = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase.from("jobs").update({
        photos_uploaded_at: new Date().toISOString(),
      }).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Marked uploaded", description: "Site photos on record." });
      queryClient.invalidateQueries({ queryKey: ["dispatch-card-alerts"] });
    },
    onError: (error) => {
      toast({
        title: "Could not mark photos uploaded",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  /**
   * Single dispatcher entry point for any alert button click. The popover UI
   * just calls runAction(alert, kind, target) and we route to the right
   * mutation/handler based on kind. Centralizes routing so the popover stays
   * dumb — it doesn't need to know about RPC names or table updates.
   */
  const runAction = (
    alert: DispatchAlert,
    kind?: DispatchAlertActionKind,
    target?: string,
  ) => {
    const k = kind || alert.actionKind;
    const t = target || alert.actionTarget;
    if (!k) return;
    switch (k) {
      case "navigate":
        if (t) navigate(t);
        return;
      case "rpc_resolve":
        resolveAlert.mutate(alert);
        return;
      case "rpc_retry":
        retryAlert.mutate(alert);
        return;
      case "mark_deposit":
        if (t) markDeposit.mutate(t);
        return;
      case "mark_financed":
        if (t) markFinanced.mutate(t);
        return;
      case "mark_completion_sent":
        if (t) markCompletionSent.mutate(t);
        return;
      case "mark_photos_uploaded":
        if (t) markPhotosUploaded.mutate(t);
        return;
    }
  };

  const isBusy = (alert: DispatchAlert) =>
    resolveAlert.isPending ||
    retryAlert.isPending ||
    markDeposit.isPending ||
    markFinanced.isPending ||
    markCompletionSent.isPending ||
    markPhotosUploaded.isPending;

  return {
    resolveAlert,
    retryAlert,
    navigateAlert,
    runAction,
    isBusy,
  };
}
