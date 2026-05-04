import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * silence-watcher — auto-hangup for "dead air" calls.
 *
 * Poll-based: scans for calls that are non-terminal and have no new
 * live-transcript rows in the last N seconds. When dead air exceeds the
 * configured threshold (company_settings.silence_hangup_seconds, default 60s,
 * 0 = disabled), issues a Twilio REST hangup.
 *
 * Safe to call on a minute cron or as a one-off fire-and-forget from the
 * live-transcribe websocket. Does NOT hang up calls that are still producing
 * transcript text on EITHER channel.
 */

type StuckCall = {
  id: string;
  twilio_sid: string;
  started_at: string | null;
  created_at: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!accountSid || !authToken) {
      return json({ error: "Twilio credentials not configured" }, 500);
    }

    const supabase = getSupabaseAdmin();

    // Read threshold from company_settings; 0 = disabled
    const { data: setting } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "silence_hangup_seconds")
      .maybeSingle();
    const thresholdSec = parseInt((setting as any)?.value ?? "60", 10);
    if (!Number.isFinite(thresholdSec) || thresholdSec <= 0) {
      return json({ skipped: true, reason: "disabled" });
    }

    // Optional: single-call mode via POST { callSid }
    let specificSid: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        specificSid = body?.callSid || null;
      } catch { /* noop */ }
    }

    // Candidate calls: non-terminal, older than thresholdSec
    const cutoffIso = new Date(Date.now() - thresholdSec * 1000).toISOString();
    const query = supabase
      .from("call_log")
      .select("id, twilio_sid, started_at, created_at")
      .not("twilio_sid", "is", null)
      .is("ended_at", null)
      .in("status", ["ringing", "initiated", "in-progress"])
      .lt("created_at", cutoffIso);

    const { data: candidates } = specificSid
      ? await query.eq("twilio_sid", specificSid)
      : await query.limit(50);

    const rows: StuckCall[] = (candidates || []) as any;
    if (rows.length === 0) {
      return json({ scanned: 0, hungUp: 0 });
    }

    const auth = "Basic " + btoa(`${accountSid}:${authToken}`);
    const apiBase = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;
    const results: any[] = [];

    for (const row of rows) {
      // ── Dead-air detection rewrite ──
      // The previous logic killed any call that had no live_transcripts rows
      // in the last `thresholdSec` window. That's WRONG: transcript silence
      // doesn't mean the call is dead — it means nobody's talking right then
      // (hold, thinking pause, hold music, low-confidence audio, Deepgram
      // filtering). Real conversations frequently have 60+ seconds of quiet.
      //
      // New rule: only hang up if the call has produced ZERO transcript rows
      // EVER, AND it's been ringing/in-progress for at least 2 minutes. That
      // catches the actual dead-line case (caller dropped, line never had
      // audio) without ever killing live conversations.
      const callAgeSec = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000);
      const MIN_DEAD_LINE_AGE_SEC = 120;

      if (callAgeSec < MIN_DEAD_LINE_AGE_SEC) {
        results.push({ sid: row.twilio_sid, action: "skip", reason: "too_young", ageSec: callAgeSec });
        continue;
      }

      // Has the call ever produced ANY transcript row?
      const { count: everCount } = await supabase
        .from("live_transcripts")
        .select("id", { count: "exact", head: true })
        .eq("twilio_sid", row.twilio_sid);

      if ((everCount ?? 0) > 0) {
        // Call has had real audio at some point — never auto-hang-up.
        // If transcription has since died (edge function killed, Deepgram
        // disconnect, etc.), the call itself is still fine on Twilio's end.
        // Let Twilio + the natural hangup flow end the call normally.
        results.push({ sid: row.twilio_sid, action: "skip", reason: "had_audio", everCount });
        continue;
      }

      // Dead line confirmed — never had any audio, > 2 min old.
      try {
        const hangupResp = await fetch(`${apiBase}/Calls/${row.twilio_sid}.json`, {
          method: "POST",
          headers: {
            Authorization: auth,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ Status: "completed" }),
        });

        if (hangupResp.ok) {
          // Stamp ended_at immediately — the terminal-status trigger will
          // coerce status into the safe `unknown` bucket if it's still ringing.
          await supabase
            .from("call_log")
            .update({ ended_at: new Date().toISOString() })
            .eq("id", row.id);
          results.push({ sid: row.twilio_sid, action: "hungup", status: hangupResp.status });
        } else {
          const text = await hangupResp.text();
          results.push({
            sid: row.twilio_sid,
            action: "error",
            status: hangupResp.status,
            body: text.slice(0, 200),
          });
        }
      } catch (e) {
        results.push({ sid: row.twilio_sid, action: "error", message: (e as Error).message });
      }
    }

    return json({
      scanned: rows.length,
      hungUp: results.filter((r) => r.action === "hungup").length,
      results,
    });
  } catch (error) {
    console.error("silence-watcher error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
