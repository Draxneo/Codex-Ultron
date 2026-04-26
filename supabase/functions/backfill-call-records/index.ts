import { resolveContact } from "../_shared/resolveContact.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY not set");

    const supabase = getSupabaseAdmin();

    // Fetch calls that need backfill: have a twilio_sid and are missing data
    const { data: calls, error } = await supabase
      .from("call_log")
      .select("id, twilio_sid, phone_number, status, duration_seconds, recording_url, contact_name, contact_type, direction")
      .not("twilio_sid", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!calls || calls.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No calls to backfill", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${calls.length} call records`);

    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
    };

    let statusFixed = 0;
    let recordingsFound = 0;
    let namesFound = 0;
    let errors = 0;

    for (const call of calls) {
      try {
        const updates: Record<string, any> = {};

        // 1. Fetch call details from Twilio
        const callResp = await fetch(`${GATEWAY_URL}/Calls/${call.twilio_sid}.json`, { headers });
        if (callResp.ok) {
          const twilioCall = await callResp.json();
          const twilioDuration = parseInt(twilioCall.duration || "0", 10);
          const twilioStatus = twilioCall.status;

          // Fix status: if duration > 0 but marked as no-answer/failed
          if (twilioDuration > 0 && ["no-answer", "busy", "failed", "canceled", "ringing", "initiated"].includes(call.status)) {
            updates.status = "completed";
            updates.duration_seconds = twilioDuration;
            statusFixed++;
          } else if (call.duration_seconds === null && twilioDuration > 0) {
            updates.duration_seconds = twilioDuration;
          }

          // Sync terminal status from Twilio if ours is still non-terminal
          if (["ringing", "initiated", "in-progress"].includes(call.status) && ["completed", "no-answer", "busy", "failed", "canceled"].includes(twilioStatus)) {
            if (!updates.status) {
              updates.status = twilioDuration > 0 ? "completed" : twilioStatus;
              statusFixed++;
            }
          }
        }

        // 2. Fetch recordings
        if (!call.recording_url) {
          const recResp = await fetch(`${GATEWAY_URL}/Calls/${call.twilio_sid}/Recordings.json`, { headers });
          if (recResp.ok) {
            const recData = await recResp.json();
            const recordings = recData.recordings || [];
            if (recordings.length > 0) {
              const recSid = recordings[0].sid;
              updates.recording_url = `https://api.twilio.com/2010-04-01/Accounts/${recordings[0].account_sid}/Recordings/${recSid}.mp3`;
              recordingsFound++;
            }
          }
        }

        // 3. Re-resolve contact name if missing or unknown
        if ((!call.contact_name || call.contact_type === "unknown") && call.phone_number) {
          const { contactName, contactType } = await resolveContact(supabase, call.phone_number);
          if (contactName) {
            updates.contact_name = contactName;
            updates.contact_type = contactType;
            namesFound++;
          }
        }

        // Apply updates
        if (Object.keys(updates).length > 0) {
          const { error: upErr } = await supabase
            .from("call_log")
            .update(updates)
            .eq("id", call.id);
          if (upErr) {
            console.log(`Update error for ${call.id}:`, upErr.message);
            errors++;
          }
        }

        // Rate limit: 300ms between Twilio calls
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        console.log(`Error processing ${call.twilio_sid}:`, (e as Error).message);
        errors++;
      }
    }

    const summary = { ok: true, total: calls.length, statusFixed, recordingsFound, namesFound, errors };
    console.log("Backfill complete:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("backfill-call-records error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
