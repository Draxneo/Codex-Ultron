import { corsHeaders } from "../_shared/cors.ts";

/**
 * Admin diagnostic: pull authoritative SMS state from Twilio.
 * Mirrors twilio-call-inspect for outbound messages where local
 * delivery_status is stuck on 'sending', 'failed', or 'undelivered'.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messageSid } = await req.json();
    if (!messageSid || typeof messageSid !== "string") {
      return new Response(JSON.stringify({ error: "Missing messageSid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!accountSid || !authToken) {
      return new Response(JSON.stringify({ error: "Twilio not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = "Basic " + btoa(`${accountSid}:${authToken}`);

    const msgResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`,
      { headers: { Authorization: auth } }
    );
    if (!msgResp.ok) {
      const text = await msgResp.text();
      return new Response(
        JSON.stringify({ error: `Twilio ${msgResp.status}: ${text}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const msg = await msgResp.json();

    // Optionally pull media list
    let media: Array<{ sid: string; content_type: string; url: string }> = [];
    if (parseInt(msg.num_media || "0", 10) > 0) {
      const mediaResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}/Media.json`,
        { headers: { Authorization: auth } }
      );
      if (mediaResp.ok) {
        const mediaJson = await mediaResp.json();
        media = (mediaJson.media_list || []).map((m: any) => ({
          sid: m.sid,
          content_type: m.content_type,
          url: `https://api.twilio.com${m.uri.replace(".json", "")}`,
        }));
      }
    }

    const result = {
      sid: msg.sid,
      status: msg.status,
      direction: msg.direction,
      from: msg.from,
      to: msg.to,
      body: msg.body,
      num_segments: msg.num_segments,
      num_media: msg.num_media,
      price: msg.price,
      price_unit: msg.price_unit,
      error_code: msg.error_code,
      error_message: msg.error_message,
      date_created: msg.date_created,
      date_sent: msg.date_sent,
      date_updated: msg.date_updated,
      media,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("twilio-sms-inspect error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
