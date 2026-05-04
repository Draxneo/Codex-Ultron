import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useAmdStatus — Tracks Twilio Answering Machine Detection result for the
 * most recent active outbound call. Returns a string like "human",
 * "machine_start", "machine_end_beep", "machine_end_silence", "fax", "unknown".
 *
 * Only active when `enabled` is true (e.g. during a connecting/on-call state).
 * Resets when the call ends.
 */
export function useAmdStatus(enabled: boolean): string | null {
  const [answeredBy, setAnsweredBy] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setAnsweredBy(null);
      return;
    }

    let cancelled = false;
    let twilioSid: string | null = null;

    // Find the most recent outbound call_log row created in the last ~30s
    const findActiveCall = async () => {
      const since = new Date(Date.now() - 30_000).toISOString();
      const { data } = await supabase
        .from("call_log")
        .select("twilio_sid, answered_by")
        .eq("direction", "outbound")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || !data?.twilio_sid) return;
      twilioSid = data.twilio_sid;
      if (data.answered_by) setAnsweredBy(data.answered_by);
    };

    findActiveCall();
    // Retry once after a moment in case TwiML insert hasn't landed yet
    const retry = setTimeout(findActiveCall, 1500);

    // Subscribe to UPDATE events on call_log; filter client-side by SID
    const channel = supabase
      .channel(`amd-watch-${Date.now()}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "call_log" },
        (payload: any) => {
          const row = payload.new;
          if (!row) return;
          if (twilioSid && row.twilio_sid !== twilioSid) return;
          if (row.answered_by) setAnsweredBy(row.answered_by);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearTimeout(retry);
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return answeredBy;
}
