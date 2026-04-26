import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type TranscriptChunk = { text: string; is_final: boolean };

export function useLiveTranscript(activeCall: any | null, isOnCall: boolean) {
  const [liveTranscript, setLiveTranscript] = useState<TranscriptChunk[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  // Track the last callSid so we can fetch saved transcript after call ends
  const lastCallSidRef = useRef<string | null>(null);
  const [lastCallLogId, setLastCallLogId] = useState<string | null>(null);

  const { data: liveTranscriptionEnabled } = useQuery({
    queryKey: ["company_settings", "live_transcription_enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", "live_transcription_enabled")
        .maybeSingle();
      return (data as any)?.value === "true";
    },
  });

  // Track callSid while on call
  useEffect(() => {
    if (isOnCall && activeCall) {
      const sid = (activeCall as any)?.parameters?.CallSid || "";
      if (sid) lastCallSidRef.current = sid;
    }
  }, [isOnCall, activeCall]);

  // Live subscription during active call
  useEffect(() => {
    if (!isOnCall || !liveTranscriptionEnabled || !activeCall) {
      // When call ends, DON'T clear transcript — keep it visible.
      // Instead, try to load saved transcript from call_log if live was empty.
      if (!isOnCall && lastCallSidRef.current) {
        const sid = lastCallSidRef.current;
        // Look up the call_log entry for last call to show saved transcript
        (async () => {
          const { data } = await supabase
            .from("call_log")
            .select("id, transcription")
            .eq("twilio_sid", sid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (data?.id) setLastCallLogId(data.id);

          // If we have no live chunks but have a saved transcript, show that
          if (data?.transcription) {
            setLiveTranscript((prev) => {
              if (prev.length > 0) return prev; // keep live data if we had it
              return [{ text: data.transcription, is_final: true }];
            });
          }
        })();
      }
      return;
    }

    const twilioSid = (activeCall as any)?.parameters?.CallSid || "";
    if (!twilioSid) return;

    // Clear previous transcript when a NEW call starts
    setLiveTranscript([]);

    const channel = supabase
      .channel(`live-transcript-${twilioSid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_transcripts",
          filter: `twilio_sid=eq.${twilioSid}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row?.text) {
            setLiveTranscript((prev) => {
              if (row.is_final) {
                const withoutLastInterim = prev.filter((p) => p.is_final);
                return [...withoutLastInterim, { text: row.text, is_final: true }];
              }
              const finals = prev.filter((p) => p.is_final);
              return [...finals, { text: row.text, is_final: false }];
            });
          }
        }
      )
      .subscribe(async (status) => {
        // Backfill any transcripts inserted before the subscription connected
        if (status === "SUBSCRIBED") {
          const { data } = await supabase
            .from("live_transcripts")
            .select("text, is_final")
            .eq("twilio_sid", twilioSid)
            .order("created_at", { ascending: true });
          if (data && data.length > 0) {
            setLiveTranscript((prev) => {
              if (prev.length > 0) return prev; // already have live data
              return data.map((r: any) => ({ text: r.text, is_final: r.is_final }));
            });
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOnCall, liveTranscriptionEnabled, activeCall]);

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveTranscript]);

  return {
    liveTranscript,
    transcriptEndRef,
    liveTranscriptionEnabled: !!liveTranscriptionEnabled,
    lastCallLogId,
  };
}

/**
 * SID-driven variant — used by the CSR Intake popup window where the
 * Twilio Device lives in a *different* Electron BrowserWindow and there's
 * no shared `activeCall` object. The caller passes the CallSid (forwarded
 * via IPC from the phone window) and an `isLive` flag.
 *
 * While `isLive` is true: subscribes to realtime inserts on `live_transcripts`.
 * When `isLive` flips false: stops the channel and tries to load the saved
 * transcription from `call_log` (so the popup keeps showing the last call).
 */
export function useLiveTranscriptBySid(sid: string | null, isLive: boolean) {
  const [liveTranscript, setLiveTranscript] = useState<TranscriptChunk[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const [lastCallLogId, setLastCallLogId] = useState<string | null>(null);

  const { data: liveTranscriptionEnabled } = useQuery({
    queryKey: ["company_settings", "live_transcription_enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", "live_transcription_enabled")
        .maybeSingle();
      return (data as any)?.value === "true";
    },
  });

  // Reset transcript whenever the SID changes (new call).
  useEffect(() => {
    setLiveTranscript([]);
    setLastCallLogId(null);
  }, [sid]);

  // Live subscription
  useEffect(() => {
    if (!sid || !liveTranscriptionEnabled || !isLive) return;

    const channel = supabase
      .channel(`live-transcript-sid-${sid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_transcripts",
          filter: `twilio_sid=eq.${sid}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row?.text) return;
          setLiveTranscript((prev) => {
            if (row.is_final) {
              const withoutLastInterim = prev.filter((p) => p.is_final);
              return [...withoutLastInterim, { text: row.text, is_final: true }];
            }
            const finals = prev.filter((p) => p.is_final);
            return [...finals, { text: row.text, is_final: false }];
          });
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // Backfill anything that arrived before the channel connected.
          const { data } = await supabase
            .from("live_transcripts")
            .select("text, is_final")
            .eq("twilio_sid", sid)
            .order("created_at", { ascending: true });
          if (data && data.length > 0) {
            setLiveTranscript((prev) => {
              if (prev.length > 0) return prev;
              return data.map((r: any) => ({ text: r.text, is_final: r.is_final }));
            });
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sid, liveTranscriptionEnabled, isLive]);

  // When call ends, fall back to the saved call_log transcript.
  useEffect(() => {
    if (isLive || !sid) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("call_log")
        .select("id, transcription")
        .eq("twilio_sid", sid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.id) setLastCallLogId(data.id);
      if (data?.transcription) {
        setLiveTranscript((prev) => {
          if (prev.length > 0) return prev;
          return [{ text: data.transcription, is_final: true }];
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive, sid]);

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [liveTranscript]);

  return {
    liveTranscript,
    transcriptEndRef,
    liveTranscriptionEnabled: !!liveTranscriptionEnabled,
    lastCallLogId,
  };
}
