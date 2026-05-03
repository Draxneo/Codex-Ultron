import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { ACTION_ITEM_STATUS } from "@/lib/actionItemLifecycle";
import { APP_ACTION_GO_LIVE_ISO, CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";

export type HeadquartersBadgeMap = Record<string, number>;

function todayIsoDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function safeCount(result: PromiseSettledResult<{ count: number | null; error: any }>) {
  if (result.status !== "fulfilled" || result.value.error) return 0;
  return result.value.count || 0;
}

export function useHeadquartersBadges(): HeadquartersBadgeMap {
  const { data = {} } = useQuery({
    queryKey: ["headquarters-badges"],
    staleTime: 10_000,
    queryFn: async () => {
      const today = todayIsoDate();

      const results = await Promise.allSettled([
        supabase
          .from("action_items" as any)
          .select("id", { count: "exact", head: true })
          .eq("status", ACTION_ITEM_STATUS.pending)
          .gte("created_at", APP_ACTION_GO_LIVE_ISO),
        supabase
          .from("workflow_alerts" as any)
          .select("id", { count: "exact", head: true })
          .is("resolved_at", null),
        supabase
          .from("action_items" as any)
          .select("id", { count: "exact", head: true })
          .eq("status", ACTION_ITEM_STATUS.pending)
          .in("category", ["new_lead", "create_customer", "thread_attention", "contact_update"])
          .gte("created_at", APP_ACTION_GO_LIVE_ISO),
        supabase
          .from("jobs" as any)
          .select("id", { count: "exact", head: true })
          .lte("scheduled_date", today)
          .not("status", "in", CLOSED_WORK_STATUS_FILTER)
          .or("assigned_to.is.null,arrival_start.is.null,address.is.null")
          .gte("created_at", APP_ACTION_GO_LIVE_ISO),
      ]);

      const pendingNowCards = safeCount(results[0]);
      const openWorkflowAlerts = safeCount(results[1]);
      const intakeCards = safeCount(results[2]);
      const dispatchGaps = safeCount(results[3]);

      return {
        "/now": pendingNowCards + openWorkflowAlerts,
        "/intake": intakeCards,
        "/dispatch": dispatchGaps + openWorkflowAlerts,
      } satisfies HeadquartersBadgeMap;
    },
  });

  useRealtimeInvalidation(
    [
      { table: "action_items", queryKeys: [["headquarters-badges"]] },
      { table: "workflow_alerts", queryKeys: [["headquarters-badges"]] },
      { table: "jobs", queryKeys: [["headquarters-badges"]] },
    ],
    "headquarters-badges"
  );

  return data;
}
