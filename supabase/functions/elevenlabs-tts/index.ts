/**
 * elevenlabs-tts — Server-side proxy for ElevenLabs Text-to-Speech.
 *
 * HYBRID CACHING (cost-saver):
 *   1. Hash (text + voiceId + speed + modelId) → SHA-256 → cache key.
 *   2. Check public `tts-cache` bucket. If hit, redirect/stream the cached MP3
 *      and skip ElevenLabs entirely (no API charge).
 *   3. On miss, generate via ElevenLabs, upload to bucket, then return.
 *
 * Repeat phrases ("Incoming call from…", "JARVIS thinking…", salutations,
 * fixed alerts) cost ZERO after the first generation.
 *
 * Body: { text: string, voiceId?: string, speed?: number, modelId?: string }
 * Returns: audio/mpeg
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const DEFAULT_VOICE_ID = "u8GDilEiJPUbRk87Lcqs";
const DEFAULT_MODEL = "eleven_turbo_v2_5";
const DEFAULT_SPEED = 1.1;
const CACHE_BUCKET = "tts-cache";

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const text = (body?.text ?? "").toString().trim();
    if (!text) {
      return new Response(
        JSON.stringify({ error: "Missing 'text'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (text.length > 1000) {
      return new Response(
        JSON.stringify({ error: "Text too long (max 1000 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const voiceId = (body?.voiceId || DEFAULT_VOICE_ID).toString();
    const modelId = (body?.modelId || DEFAULT_MODEL).toString();
    const speed = typeof body?.speed === "number" ? body.speed : DEFAULT_SPEED;

    // Build a stable cache key. Anything that affects audio output goes in.
    const cacheKey = await sha256Hex(
      JSON.stringify({ text, voiceId, modelId, speed: Math.round(speed * 100) / 100 }),
    );
    const cachePath = `${cacheKey.slice(0, 2)}/${cacheKey}.mp3`;

    // Service-role client for cache R/W (bucket is public-read, service-write).
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) Cache lookup — try downloading the cached MP3.
    try {
      const { data: cached, error: dlErr } = await admin.storage
        .from(CACHE_BUCKET)
        .download(cachePath);
      if (!dlErr && cached) {
        const bytes = new Uint8Array(await cached.arrayBuffer());
        return new Response(bytes, {
          headers: {
            ...corsHeaders,
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-TTS-Cache": "hit",
          },
        });
      }
    } catch (e) {
      // Non-fatal — fall through to generation.
      console.warn("[elevenlabs-tts] cache lookup failed:", (e as Error).message);
    }

    // 2) Cache miss → generate via ElevenLabs.
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
          speed,
        },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("[elevenlabs-tts] upstream error", upstream.status, errText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs error: ${upstream.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // We need the full bytes (to upload AND return), so buffer the stream.
    const audioBytes = new Uint8Array(await upstream.arrayBuffer());

    // 3) Fire-and-forget upload to cache (don't block the response on this).
    admin.storage
      .from(CACHE_BUCKET)
      .upload(cachePath, audioBytes, {
        contentType: "audio/mpeg",
        cacheControl: "31536000",
        upsert: false,
      })
      .then(({ error }) => {
        if (error && !String(error.message).toLowerCase().includes("exists")) {
          console.warn("[elevenlabs-tts] cache upload failed:", error.message);
        }
      });

    return new Response(audioBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-TTS-Cache": "miss",
      },
    });
  } catch (err: any) {
    console.error("[elevenlabs-tts] error", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
