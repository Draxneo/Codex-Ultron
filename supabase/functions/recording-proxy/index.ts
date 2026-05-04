import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const recordingUrl = url.searchParams.get("url");

    if (!recordingUrl) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate it's a Twilio recording URL
    if (!recordingUrl.includes("api.twilio.com") && !recordingUrl.includes("recordings")) {
      return new Response(JSON.stringify({ error: "Invalid recording URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;

    if (!accountSid || !authToken) {
      return new Response(JSON.stringify({ error: "Twilio credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure .mp3 extension for browser-compatible playback
    const audioUrl = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;

    const resp = await fetch(audioUrl, {
      headers: {
        Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      },
    });

    if (!resp.ok) {
      console.error("Twilio fetch failed:", resp.status, await resp.text());
      return new Response(JSON.stringify({ error: "Failed to fetch recording" }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audioData = await resp.arrayBuffer();

    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("recording-proxy error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
