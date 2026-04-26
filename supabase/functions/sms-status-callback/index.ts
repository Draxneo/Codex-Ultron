import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { validateTwilioSignature } from "../_shared/twilioSignature.ts";
import { logApiUsage } from "../_shared/apiUsageLog.ts";

// Status priority — once we reach a higher state, don't regress to a lower one.
const STATUS_RANK: Record<string, number> = {
  queued: 1,
  accepted: 1,
  scheduled: 1,
  sending: 2,
  sent: 3,
  receiving: 3,
  received: 4,
  delivered: 5,
  read: 6,
  undelivered: 7,
  failed: 7,
  canceled: 7,
};

function rank(s: string | null | undefined): number {
  if (!s) return 0;
  return STATUS_RANK[s.toLowerCase()] ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.text();

    // Validate Twilio signature (fail open if TWILIO_AUTH_TOKEN not set, like voice path)
    const sigValid = await validateTwilioSignature(req, formData);
    if (!sigValid) {
      console.warn("Rejecting SMS status callback: invalid Twilio signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams(formData);

    const messageSid = params.get("MessageSid") || params.get("SmsSid") || "";
    const messageStatus = (params.get("MessageStatus") || params.get("SmsStatus") || "").toLowerCase();
    const errorCode = params.get("ErrorCode");
    const errorMessage = params.get("ErrorMessage");
    const numSegments = params.get("NumSegments");
    const numMedia = params.get("NumMedia");
    const price = params.get("Price");
    const priceUnit = params.get("PriceUnit");

    if (!messageSid) {
      return new Response(JSON.stringify({ error: "Missing MessageSid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    // Look up current status to avoid regressing delivered → sent
    const { data: existing } = await supabase
      .from("sms_log")
      .select("id, delivery_status, num_segments")
      .eq("twilio_sid", messageSid)
      .maybeSingle();

    if (!existing) {
      console.warn(`SMS status callback for unknown SID ${messageSid} (status=${messageStatus})`);
      // Still 200 so Twilio doesn't retry forever
      return new Response(JSON.stringify({ ok: true, unknown: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, unknown> = {};

    // Only advance status forward
    if (rank(messageStatus) >= rank(existing.delivery_status)) {
      updates.delivery_status = messageStatus;
    } else {
      console.log(
        `Ignoring out-of-order status ${messageStatus} (current=${existing.delivery_status}) for ${messageSid}`
      );
    }

    if (errorCode) updates.error_code = errorCode;

    // Capture authoritative segment count from Twilio
    if (numSegments) {
      const n = parseInt(numSegments, 10);
      if (Number.isFinite(n) && n > 0 && n !== existing.num_segments) {
        updates.num_segments = n;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("sms_log")
        .update(updates)
        .eq("twilio_sid", messageSid);
      if (error) console.error("Failed to update sms_log:", error);
    }

    // Log authoritative cost from Twilio (Price is negative number string, e.g. "-0.00790")
    if (price && priceUnit) {
      const priceFloat = Math.abs(parseFloat(price));
      if (Number.isFinite(priceFloat) && priceFloat > 0) {
        logApiUsage(supabase, {
          service: "twilio_sms",
          function_name: "sms-status-callback",
          endpoint: "Messages.json:final-price",
          estimated_cost_cents: Math.round(priceFloat * 100),
          metadata: {
            message_sid: messageSid,
            status: messageStatus,
            num_segments: numSegments,
            num_media: numMedia,
            price_unit: priceUnit,
          },
        });
      }
    }

    console.log(
      `SMS status callback: ${messageSid} → ${messageStatus}${
        errorCode ? ` (error: ${errorCode} - ${errorMessage})` : ""
      }${numSegments ? ` segs=${numSegments}` : ""}${price ? ` price=${price}${priceUnit}` : ""}`
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("SMS status callback error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
