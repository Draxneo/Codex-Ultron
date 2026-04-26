import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Reconciles "ghost" call_log rows against Twilio's REST API.
 * A ghost row = a row with a twilio_sid but no duration, no recording,
 * and a non-terminal (or client-swept) status.
 *
 * Pulls Twilio truth (parent call + child legs + recordings) and
 * updates the row with real duration/recording/status, OR stamps
 * ended_at with Twilio's actual end_time when no answer.
 *
 * Runs:
 *  - As a daily cron (no body / GET)
 *  - Manually against a specific SID (POST { callSid: "CA..." })
 */

type TwilioCall = {
  sid: string;
  status: string;
  duration: string | null;
  start_time: string | null;
  end_time: string | null;
  answered_by: string | null;
  parent_call_sid: string | null;
};

type TwilioRecording = {
  sid: string;
  duration: string | null;
  call_sid: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) {
    return json({ error: "Twilio credentials not configured" }, 500);
  }

  const supabase = getSupabaseAdmin();
  const auth = "Basic " + btoa(`${accountSid}:${authToken}`);
  const apiBase = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

  const fetchTwilio = async (path: string): Promise<any | null> => {
    try {
      const r = await fetch(`${apiBase}${path}`, { headers: { Authorization: auth } });
      if (!r.ok) {
        console.warn(`Twilio ${path} -> ${r.status}`);
        return null;
      }
      return await r.json();
    } catch (e) {
      console.warn(`Twilio ${path} threw:`, (e as Error).message);
      return null;
    }
  };

  // Pick rows to reconcile
  let specificSid: string | null = null;
  let scope: "recent" | "daily" = "daily";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      specificSid = body?.callSid || null;
      if (body?.scope === "recent") scope = "recent";
    } catch { /* ignore */ }
  }
  // GET with ?scope=recent also works for cron
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("scope") === "recent") scope = "recent";
  } catch { /* ignore */ }

  let rows: { id: string; twilio_sid: string; status: string; created_at: string }[] = [];

  if (specificSid) {
    const { data } = await supabase
      .from("call_log")
      .select("id, twilio_sid, status, created_at")
      .eq("twilio_sid", specificSid);
    rows = (data || []) as any;
  } else if (scope === "recent") {
    // Fast cron: rows < 2h old, stuck ≥ 10min
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("call_log")
      .select("id, twilio_sid, status, created_at, duration_seconds, recording_url")
      .not("twilio_sid", "is", null)
      .is("duration_seconds", null)
      .is("recording_url", null)
      .in("status", ["no-answer", "unknown", "ringing", "initiated", "in-progress", "missed-while-busy"])
      .gte("created_at", twoHoursAgo)
      .lt("created_at", tenMinAgo)
      .limit(100);
    rows = (data || []) as any;
  } else {
    // Daily cron: any ghost row from last 7 days that needs reconciliation
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("call_log")
      .select("id, twilio_sid, status, created_at, duration_seconds, recording_url")
      .not("twilio_sid", "is", null)
      .is("duration_seconds", null)
      .is("recording_url", null)
      .in("status", ["no-answer", "unknown", "ringing", "initiated", "in-progress", "missed-while-busy"])
      .gte("created_at", sevenDaysAgo)
      .lt("created_at", fifteenMinAgo)
      .limit(200);
    rows = (data || []) as any;
  }

  // ─────────────────────────────────────────────────────────────────────
  // FORCE-CLOSE STUCK in-progress ROWS (ghost-busy protection)
  // Any row stuck at status='in-progress' for >65min cannot be a real call
  // (Twilio's max timeLimit is 60min). These rows would otherwise block
  // routing forever via isUserBusy() → callers ring busy users instead of
  // overflowing to the answering service.
  // ─────────────────────────────────────────────────────────────────────
  const stuckCutoff = new Date(Date.now() - 65 * 60 * 1000).toISOString();
  const { data: stuckRows, error: stuckErr } = await supabase
    .from("call_log")
    .select("id, twilio_sid, status, started_at")
    .eq("status", "in-progress")
    .lt("started_at", stuckCutoff)
    .limit(50);

  let forceClosedCount = 0;
  if (!stuckErr && stuckRows && stuckRows.length > 0) {
    console.log(`[reconcile] Force-closing ${stuckRows.length} stuck in-progress rows`);
    for (const stuck of stuckRows as Array<{ id: string; twilio_sid: string | null; started_at: string | null }>) {
      // If we have a Twilio SID, ask Twilio for ground truth before stamping
      let finalStatus = "completed";
      let endTime = new Date().toISOString();
      let durationSeconds: number | null = null;

      if (stuck.twilio_sid) {
        const twilioCall: TwilioCall | null = await fetchTwilio(`/Calls/${stuck.twilio_sid}.json`);
        if (twilioCall) {
          finalStatus = ["completed", "no-answer", "busy", "canceled", "failed"].includes(twilioCall.status)
            ? twilioCall.status
            : "completed";
          if (twilioCall.end_time) endTime = new Date(twilioCall.end_time).toISOString();
          const dur = Number(twilioCall.duration) || 0;
          if (dur > 0) durationSeconds = dur;
        }
      }

      const { error: closeErr } = await supabase
        .from("call_log")
        .update({
          status: finalStatus,
          ended_at: endTime,
          ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
        })
        .eq("id", stuck.id);

      if (!closeErr) forceClosedCount++;
      else console.warn(`[reconcile] Failed to force-close ${stuck.id}:`, closeErr.message);
    }
  }

  const results: any[] = [];
  for (const row of rows) {
    const parent: TwilioCall | null = await fetchTwilio(`/Calls/${row.twilio_sid}.json`);
    if (!parent) {
      results.push({ id: row.id, sid: row.twilio_sid, reconciled: false, reason: "twilio_not_found" });
      continue;
    }

    // Children (for <Dial> legs)
    const childrenResp = await fetchTwilio(`/Calls.json?ParentCallSid=${row.twilio_sid}&PageSize=20`);
    const children: TwilioCall[] = (childrenResp?.calls || []) as TwilioCall[];

    // Recordings on parent + children
    const recordingCandidates: TwilioRecording[] = [];
    const sidsToCheck = [row.twilio_sid, ...children.map((c) => c.sid)];
    for (const sid of sidsToCheck) {
      const recResp = await fetchTwilio(`/Calls/${sid}/Recordings.json?PageSize=5`);
      for (const rec of recResp?.recordings || []) {
        recordingCandidates.push(rec as TwilioRecording);
      }
    }

    // Pick the longest recording, if any
    const bestRecording = recordingCandidates.sort(
      (a, b) => Number(b.duration || 0) - Number(a.duration || 0)
    )[0] || null;

    // Derive ground truth
    const parentDuration = Number(parent.duration) || 0;
    const childWithDuration = children.find((c) => Number(c.duration) > 0);
    const finalDuration = Math.max(parentDuration, Number(childWithDuration?.duration) || 0);

    const endTime = parent.end_time ? new Date(parent.end_time).toISOString() : null;

    // Map Twilio status → our status taxonomy
    let newStatus = parent.status;
    if (finalDuration > 0 || bestRecording) {
      newStatus = "completed";
    } else if (["no-answer", "busy", "canceled", "failed"].includes(parent.status)) {
      newStatus = parent.status;
    }

    const recordingUrl = bestRecording
      ? `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${bestRecording.sid}`
      : null;

    const update: Record<string, any> = {
      status: newStatus,
      ...(finalDuration > 0 ? { duration_seconds: finalDuration } : {}),
      ...(recordingUrl ? { recording_url: recordingUrl } : {}),
      ...(endTime ? { ended_at: endTime } : {}),
      ...(parent.answered_by ? { answered_by: parent.answered_by } : {}),
    };

    const { error } = await supabase.from("call_log").update(update).eq("id", row.id);
    results.push({
      id: row.id,
      sid: row.twilio_sid,
      reconciled: !error,
      new_status: newStatus,
      duration: finalDuration,
      had_recording: !!bestRecording,
      error: error?.message,
    });
  }

  return json({
    scanned: rows.length,
    reconciled: results.filter((r) => r.reconciled).length,
    force_closed_stuck: forceClosedCount,
    results,
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
