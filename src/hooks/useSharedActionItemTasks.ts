import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  ACTION_ITEMS_PENDING_QUERY_KEY,
  HUD_ATTENTION_COUNTS_QUERY_KEY,
  invalidateActionItemQueues,
} from "@/lib/actionItemLifecycle";

const CLAIM_METADATA_KEY = "shared_task_claim";
const CLAIM_TTL_MS = 2 * 60 * 1000;

type ClaimMetadata = {
  user_id?: string | null;
  label?: string | null;
  claimed_at?: string | null;
};

type ActionItemLike = {
  id: string;
  metadata?: unknown;
};

type ClaimState = {
  claim: ClaimMetadata | null;
  isClaimed: boolean;
  isClaimedByCurrentUser: boolean;
  isClaimedByOther: boolean;
  label: string | null;
};

function getClaim(metadata: unknown): ClaimMetadata | null {
  const raw = (metadata || {}) as Record<string, unknown>;
  const claim = raw[CLAIM_METADATA_KEY] as ClaimMetadata | undefined;
  if (!claim?.claimed_at) return null;

  const claimedAt = Date.parse(claim.claimed_at);
  if (!Number.isFinite(claimedAt)) return null;
  if (Date.now() - claimedAt > CLAIM_TTL_MS) return null;

  return claim;
}

function mergeClaim(metadata: unknown, claim: ClaimMetadata | null) {
  const next = { ...((metadata || {}) as Record<string, unknown>) };
  if (claim) {
    next[CLAIM_METADATA_KEY] = claim;
  } else {
    delete next[CLAIM_METADATA_KEY];
  }
  return next;
}

export function useSharedActionItemTasks(channelName = "shared-action-item-tasks") {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useRealtimeInvalidation(
    [
      {
        table: "action_items",
        queryKeys: [
          [...ACTION_ITEMS_PENDING_QUERY_KEY],
          [...HUD_ATTENTION_COUNTS_QUERY_KEY],
        ],
      },
    ],
    channelName
  );

  const invalidate = useCallback(() => {
    invalidateActionItemQueues(queryClient);
  }, [queryClient]);

  const getClaimState = useCallback(
    (item: ActionItemLike): ClaimState => {
      const claim = getClaim(item.metadata);
      const claimUserId = claim?.user_id || null;
      const currentUserId = user?.id || null;
      const isClaimed = Boolean(claim);
      const isClaimedByCurrentUser = Boolean(isClaimed && currentUserId && claimUserId === currentUserId);
      const isClaimedByOther = Boolean(isClaimed && (!currentUserId || claimUserId !== currentUserId));

      return {
        claim,
        isClaimed,
        isClaimedByCurrentUser,
        isClaimedByOther,
        label: claim?.label || "Someone else",
      };
    },
    [user?.id]
  );

  const claimActionItem = useCallback(
    async (item: ActionItemLike) => {
      const userId = user?.id || null;
      if (!userId) {
        return { ok: false, reason: "Sign in before taking this action." };
      }

      const currentClaim = getClaim(item.metadata);
      if (currentClaim?.user_id && currentClaim.user_id !== userId) {
        return {
          ok: false,
          reason: `${currentClaim.label || "Someone else"} is already working this card.`,
        };
      }

      const { data, error } = await supabase.rpc("claim_action_item_once" as any, {
        p_id: item.id,
        p_label: user.email || "Current user",
      });

      if (error) throw error;
      if (data && !(data as any).ok) {
        return { ok: false, reason: (data as any).reason || "That card is no longer pending." };
      }

      invalidate();
      return { ok: true, reason: null };
    },
    [invalidate, user?.email, user?.id]
  );

  const releaseActionItemClaim = useCallback(
    async (item: ActionItemLike) => {
      const userId = user?.id || null;
      const currentClaim = getClaim(item.metadata);
      if (!userId || currentClaim?.user_id !== userId) return;

      const { error } = await supabase
        .from("action_items")
        .update({ metadata: mergeClaim(item.metadata, null) })
        .eq("id", item.id)
        .eq("status", "pending");

      if (error) throw error;
      invalidate();
    },
    [invalidate, user?.id]
  );

  return {
    claimActionItem,
    releaseActionItemClaim,
    getClaimState,
    invalidate,
  };
}
