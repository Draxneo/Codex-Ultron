import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type TableSubscription = {
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Query keys to invalidate when a change is detected */
  queryKeys: string[][];
  /** Optional callback for custom logic (e.g. desktop notifications) */
  onEvent?: (payload: any) => void;
  /** Optional filter (e.g. "channel_id=eq.xxx") */
  filter?: string;
};

/**
 * Subscribes to Postgres changes for the given tables and invalidates
 * the associated React Query keys on change. Opens ONE channel for all
 * subscriptions passed in, reducing WebSocket connections.
 *
 * Usage:
 * ```ts
 * useRealtimeInvalidation([
 *   { table: "sms_log", queryKeys: [["sms_log"], ["unread_sms"]] },
 *   { table: "call_log", queryKeys: [["call_log"]] },
 * ]);
 * ```
 */
export function useRealtimeInvalidation(
  subscriptions: TableSubscription[],
  channelName?: string
) {
  const queryClient = useQueryClient();
  const subsRef = useRef(subscriptions);
  const instanceIdRef = useRef<string>();
  if (!instanceIdRef.current) {
    const randomId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    instanceIdRef.current = `${Date.now()}-${randomId}`;
  }
  subsRef.current = subscriptions;

  useEffect(() => {
    if (subsRef.current.length === 0) return;

    const baseName = channelName || `rt-invalidation-${subsRef.current.map(s => s.table).join("-")}`;
    const name = `${baseName}-${instanceIdRef.current}`;
    supabase
      .getChannels()
      .filter((existing) => existing.topic === `realtime:${name}`)
      .forEach((existing) => {
        void supabase.removeChannel(existing);
      });
    let channel = supabase.channel(name);

    for (const sub of subsRef.current) {
      channel = channel.on(
        "postgres_changes" as any,
        {
          event: sub.event || "*",
          schema: "public",
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        (payload: any) => {
          for (const key of sub.queryKeys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
          sub.onEvent?.(payload);
        }
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, queryClient]);
}
