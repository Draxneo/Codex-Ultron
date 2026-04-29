import { buildKeytermParams } from "./deepgramKeyterms.ts";

export type TranscriptionProvider = "bridgevoice" | "openai" | "deepgram" | "mock";

type TranscriptionInput = {
  audioBytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
  prompt?: string;
  supabase?: { from: (table: string) => any };
};

export type TranscriptionResult = {
  text: string;
  provider: TranscriptionProvider;
  model?: string;
  metadata?: Record<string, unknown>;
};

const DEFAULT_PROMPT = [
  "Transcribe this as a short business dictation message for an HVAC company.",
  "Use clean punctuation, normal capitalization, and readable sentence spacing.",
  "Preserve names, phone numbers, addresses, HVAC terms, brands, model numbers, and dates.",
  "Do not add information that was not spoken.",
].join(" ");

export function normalizeProvider(value?: string | null): TranscriptionProvider | null {
  const cleaned = (value || "").trim().toLowerCase();
  if (cleaned === "bridgevoice" || cleaned === "bridgemind") return "bridgevoice";
  if (cleaned === "openai" || cleaned === "whisper") return "openai";
  if (cleaned === "deepgram") return "deepgram";
  if (cleaned === "mock") return "mock";
  return null;
}

export function resolveProvider(requested?: string | null): TranscriptionProvider {
  const explicit = normalizeProvider(requested);
  if (explicit) return explicit;

  const configured = normalizeProvider(
    Deno.env.get("DICTATION_TRANSCRIPTION_PROVIDER") ||
      Deno.env.get("TRANSCRIPTION_PROVIDER") ||
      Deno.env.get("TRANSCRIBE_PROVIDER"),
  );
  if (configured) return configured;

  if (Deno.env.get("OPENAI_API_KEY")) return "openai";
  if (Deno.env.get("DEEPGRAM_API_KEY")) return "deepgram";
  return "mock";
}

function cleanTranscript(text: string): string {
  return (text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

async function transcribeWithOpenAI(input: TranscriptionInput): Promise<TranscriptionResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const model = Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") || "gpt-4o-mini-transcribe";
  const form = new FormData();
  form.append("model", model);
  form.append("response_format", "json");
  form.append("prompt", input.prompt || DEFAULT_PROMPT);
  form.append(
    "file",
    new File([input.audioBytes], input.fileName || "dictation.webm", {
      type: input.mimeType || "audio/webm",
    }),
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("OpenAI transcription error:", response.status, details);
    throw new Error(`OpenAI transcription error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: cleanTranscript(data?.text || data?.transcription || ""),
    provider: "openai",
    model,
    metadata: {
      bytes: input.audioBytes.byteLength,
      duration: data?.duration ?? null,
      usage: data?.usage ?? null,
    },
  };
}

async function transcribeWithDeepgram(input: TranscriptionInput): Promise<TranscriptionResult> {
  const apiKey = Deno.env.get("DEEPGRAM_API_KEY");
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not configured");

  const model = Deno.env.get("DEEPGRAM_TRANSCRIPTION_MODEL") || "nova-3";
  const keyterms = input.supabase ? await buildKeytermParams(input.supabase as any) : "";
  const response = await fetch(
    `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&smart_format=true&language=en${keyterms}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": input.mimeType || "audio/webm",
      },
      body: input.audioBytes,
    },
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Deepgram transcription error:", response.status, details);
    throw new Error(`Deepgram transcription error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: cleanTranscript(data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ""),
    provider: "deepgram",
    model,
    metadata: {
      bytes: input.audioBytes.byteLength,
      duration: data?.metadata?.duration ?? null,
      request_id: data?.metadata?.request_id ?? null,
    },
  };
}

async function transcribeWithBridgeVoice(input: TranscriptionInput): Promise<TranscriptionResult> {
  const apiUrl = Deno.env.get("BRIDGEVOICE_TRANSCRIBE_URL") || Deno.env.get("BRIDGEMIND_TRANSCRIBE_URL");
  const apiKey = Deno.env.get("BRIDGEVOICE_API_KEY") || Deno.env.get("BRIDGEMIND_API_KEY");
  if (!apiUrl || !apiKey) {
    throw new Error("BridgeVoice provider is not configured. Set BRIDGEVOICE_TRANSCRIBE_URL and BRIDGEVOICE_API_KEY.");
  }

  const form = new FormData();
  form.append("prompt", input.prompt || DEFAULT_PROMPT);
  form.append(
    "file",
    new File([input.audioBytes], input.fileName || "dictation.webm", {
      type: input.mimeType || "audio/webm",
    }),
  );

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("BridgeVoice transcription error:", response.status, details);
    throw new Error(`BridgeVoice transcription error: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return {
      text: cleanTranscript(data?.cleanedText || data?.text || data?.transcription || ""),
      provider: "bridgevoice",
      model: data?.model || "bridgevoice",
      metadata: { bytes: input.audioBytes.byteLength },
    };
  }

  return {
    text: cleanTranscript(await response.text()),
    provider: "bridgevoice",
    model: "bridgevoice",
    metadata: { bytes: input.audioBytes.byteLength },
  };
}

async function transcribeWithMock(input: TranscriptionInput): Promise<TranscriptionResult> {
  return {
    text: "Mock dictation text. Replace this once a transcription provider is configured.",
    provider: "mock",
    model: "mock",
    metadata: { bytes: input.audioBytes.byteLength },
  };
}

export async function transcribeAudio(
  provider: TranscriptionProvider,
  input: TranscriptionInput,
): Promise<TranscriptionResult> {
  switch (provider) {
    case "bridgevoice":
      return transcribeWithBridgeVoice(input);
    case "openai":
      return transcribeWithOpenAI(input);
    case "deepgram":
      return transcribeWithDeepgram(input);
    case "mock":
      return transcribeWithMock(input);
  }
}
