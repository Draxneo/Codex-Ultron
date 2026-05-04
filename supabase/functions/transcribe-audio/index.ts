import { logApiUsage } from "../_shared/apiUsageLog.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  resolveProvider,
  transcribeAudio,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "../_shared/transcriptionProviders.ts";

function formString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function canFallbackToDeepgram(provider: TranscriptionProvider): boolean {
  return provider !== "deepgram" && !!Deno.env.get("DEEPGRAM_API_KEY");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";

    let audioBytes: ArrayBuffer;
    let mimeType = "audio/webm";
    let fileName = "dictation.webm";
    let requestedProvider: string | undefined;
    let prompt: string | undefined;
    let isRecordingUrlRequest = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) throw new Error("No audio file provided");

      audioBytes = await file.arrayBuffer();
      mimeType = file.type || "audio/webm";
      fileName = file.name || fileName;
      requestedProvider = formString(formData.get("provider"));
      prompt = formString(formData.get("prompt"));
    } else {
      isRecordingUrlRequest = true;
      const body = await req.json();
      const recordingUrl = body?.recording_url;
      if (!recordingUrl) throw new Error("No recording_url provided");

      const url = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;
      const audioResp = await fetch(url);
      if (!audioResp.ok) throw new Error(`Failed to fetch recording: ${audioResp.status}`);

      audioBytes = await audioResp.arrayBuffer();
      mimeType = "audio/mpeg";
      fileName = "recording.mp3";
      requestedProvider = typeof body?.provider === "string" ? body.provider : undefined;
      prompt = typeof body?.prompt === "string" ? body.prompt : undefined;
    }

    const sb = getSupabaseAdmin();
    const primaryProvider = resolveProvider(requestedProvider || (isRecordingUrlRequest ? "deepgram" : undefined));
    let fallbackFrom: TranscriptionProvider | null = null;
    let result: TranscriptionResult;

    try {
      result = await transcribeAudio(primaryProvider, {
        audioBytes,
        mimeType,
        fileName,
        prompt,
        supabase: sb,
      });
    } catch (error) {
      if (!canFallbackToDeepgram(primaryProvider)) throw error;

      console.warn(
        `transcribe-audio provider ${primaryProvider} failed; falling back to deepgram:`,
        error instanceof Error ? error.message : error,
      );
      fallbackFrom = primaryProvider;
      result = await transcribeAudio("deepgram", {
        audioBytes,
        mimeType,
        fileName,
        prompt,
        supabase: sb,
      });
    }

    await logApiUsage(sb, {
      service: result.provider === "openai" ? "openai" : result.provider,
      function_name: "transcribe-audio",
      endpoint: result.provider === "openai" ? "audio/transcriptions" : "transcribe",
      estimated_cost_cents: 0,
      metadata: {
        provider: result.provider,
        requested_provider: requestedProvider || null,
        fallback_from: fallbackFrom,
        model: result.model || null,
        bytes: audioBytes.byteLength,
        ...(result.metadata || {}),
      },
    });

    return new Response(
      JSON.stringify({
        transcription: result.text,
        cleanedText: result.text,
        provider: result.provider,
        requestedProvider: requestedProvider || null,
        fallbackFrom,
        model: result.model || null,
        metadata: result.metadata || {},
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("transcribe-audio error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
