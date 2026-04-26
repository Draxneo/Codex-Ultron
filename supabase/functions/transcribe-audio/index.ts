import { logApiUsage } from "../_shared/apiUsageLog.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { buildKeytermParams } from "../_shared/deepgramKeyterms.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
    if (!DEEPGRAM_API_KEY) throw new Error("DEEPGRAM_API_KEY is not configured");

    const contentType = req.headers.get("content-type") || "";

    let audioBytes: ArrayBuffer;
    let mimeType = "audio/webm";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) throw new Error("No audio file provided");
      audioBytes = await file.arrayBuffer();
      mimeType = file.type || "audio/webm";
    } else {
      const body = await req.json();
      const { recording_url } = body;
      if (!recording_url) throw new Error("No recording_url provided");

      const url = recording_url.endsWith(".mp3") ? recording_url : `${recording_url}.mp3`;
      const audioResp = await fetch(url);
      if (!audioResp.ok) throw new Error(`Failed to fetch recording: ${audioResp.status}`);
      audioBytes = await audioResp.arrayBuffer();
      mimeType = "audio/mpeg";
    }

    const sb = getSupabaseAdmin();
    const keyterms = await buildKeytermParams(sb);
    const dgResp = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en${keyterms}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": mimeType,
        },
        body: audioBytes,
      }
    );

    if (!dgResp.ok) {
      const errText = await dgResp.text();
      console.error("Deepgram API error:", dgResp.status, errText);
      throw new Error(`Deepgram API error: ${dgResp.status}`);
    }

    const dgData = await dgResp.json();
    const transcription = dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";

    // Log Deepgram usage — nova-3 is ~$0.0043/min = ~0.0072¢/sec, store with precision
    const estimatedSeconds = Math.max(1, Math.round((audioBytes as ArrayBuffer).byteLength / 16000));
    const deepgramCents = Math.round((estimatedSeconds * 0.0072) * 10000) / 10000;
    logApiUsage(sb, { service: "deepgram", function_name: "transcribe-audio", endpoint: "listen", estimated_cost_cents: deepgramCents, metadata: { seconds: estimatedSeconds } });

    return new Response(
      JSON.stringify({ transcription }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("transcribe-audio error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
