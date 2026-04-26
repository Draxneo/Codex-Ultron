/**
 * Per-model pricing for Lovable AI Gateway calls.
 * Rates are in **dollars per 1M tokens** (input / output) and reflect the
 * underlying provider list pricing (Lovable adds a small margin on top).
 *
 * estimateCostCents() returns a *cents* value (rounded up to at least 1
 * if any tokens were used) so the api_usage_log dashboard reflects real spend
 * — not the legacy hardcoded 3¢/token multiplier which over-reported by ~6,000×.
 */

type Rate = { in: number; out: number }; // USD per 1M tokens

const PRICING: Record<string, Rate> = {
  // Google Gemini
  "google/gemini-3-flash-preview":   { in: 0.30, out: 2.50 },
  "google/gemini-3.1-flash-image-preview": { in: 0.30, out: 2.50 },
  "google/gemini-3-pro-image-preview": { in: 2.00, out: 12.00 },
  "google/gemini-3.1-pro-preview":   { in: 2.00, out: 12.00 },
  "google/gemini-2.5-pro":           { in: 1.25, out: 10.00 },
  "google/gemini-2.5-flash":         { in: 0.30, out: 2.50 },
  "google/gemini-2.5-flash-lite":    { in: 0.10, out: 0.40 },
  "google/gemini-2.5-flash-image":   { in: 0.30, out: 2.50 },
  // OpenAI
  "openai/gpt-5":      { in: 1.25, out: 10.00 },
  "openai/gpt-5.2":    { in: 1.25, out: 10.00 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.00 },
  "openai/gpt-5-nano": { in: 0.05, out: 0.40 },
  // Embeddings (OpenAI direct, kept here for unified calc)
  "text-embedding-3-small": { in: 0.02, out: 0 },
};

const DEFAULT_RATE: Rate = { in: 0.30, out: 2.50 };

export function getModelRate(model: string): Rate {
  return PRICING[model] || DEFAULT_RATE;
}

/**
 * Compute estimated cost in **cents** for a single AI gateway call.
 * Pass input + output tokens separately when available — falls back to a
 * 50/50 split of `total` if you only have a combined token count.
 */
export function estimateCostCents(opts: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): number {
  const rate = getModelRate(opts.model);
  let inT = opts.inputTokens ?? 0;
  let outT = opts.outputTokens ?? 0;
  if (!inT && !outT && opts.totalTokens) {
    // Assume typical 70/30 split (input-heavy for chat with big system prompts)
    inT = Math.round(opts.totalTokens * 0.7);
    outT = opts.totalTokens - inT;
  }
  const usd = (inT * rate.in + outT * rate.out) / 1_000_000;
  const cents = usd * 100;
  if (cents <= 0) return 0;
  // Store with 4-decimal precision so a 2k-token gemini-flash call (~0.06¢)
  // doesn't get rounded up to 1¢ (16× overcharge). DB column is numeric.
  return Math.round(cents * 10000) / 10000;
}
