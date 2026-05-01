import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logClientSystemError } from "@/lib/systemErrorLog";

export const ACTION_ITEM_STATUS = {
  pending: "pending",
  accepted: "accepted",
  dismissed: "dismissed",
} as const;

export type ActionItemStatus = (typeof ACTION_ITEM_STATUS)[keyof typeof ACTION_ITEM_STATUS];
export type ActionItemResolutionStatus =
  | typeof ACTION_ITEM_STATUS.accepted
  | typeof ACTION_ITEM_STATUS.dismissed;

export const ACTION_ITEMS_PENDING_QUERY_KEY = ["action_items_pending"] as const;
export const HUD_ATTENTION_COUNTS_QUERY_KEY = ["hud_attention_counts"] as const;

type ResolveActionItemInput = {
  id: string;
  status: ActionItemResolutionStatus;
  userId?: string | null;
  title?: string | null;
  jobId?: string | null;
  activityDetails?: string | null;
};

export async function resolveActionItem({
  id,
  status,
  userId,
  title,
  jobId,
  activityDetails,
}: ResolveActionItemInput) {
  const { data, error } = await supabase.rpc("resolve_action_item_once" as any, {
    p_id: id,
    p_status: status,
  });

  if (error) throw error;
  if (data && !(data as any).ok) {
    throw new Error((data as any).reason || "That card is already handled.");
  }

  if (title || activityDetails) {
    const { error: activityError } = await supabase.from("activity_log").insert({
      action: `action_item_${status}`,
      details: activityDetails || `${title} - ${status}`,
      job_id: jobId || null,
      performed_by: userId || null,
    });
    if (activityError) {
      console.warn("[actionItemLifecycle] Action item was resolved, but activity logging failed.", activityError);
      void logClientSystemError({
        sourceName: "action-item-lifecycle",
        message: activityError.message || "Action item was resolved, but activity logging failed.",
        severity: "warning",
        context: {
          action_item_id: id,
          status,
          job_id: jobId || null,
          performed_by: userId || null,
        },
      });
    }
  }
}

export function invalidateActionItemQueues(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ACTION_ITEMS_PENDING_QUERY_KEY });
  qc.invalidateQueries({ queryKey: HUD_ATTENTION_COUNTS_QUERY_KEY });
}

export function getActionItemPhone(item: {
  customer_phone?: string | null;
  metadata?: unknown;
}) {
  const metadata = (item.metadata || {}) as any;
  return metadata.phone || metadata.customer_phone || metadata.callback_phone || item.customer_phone || null;
}
