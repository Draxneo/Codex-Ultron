/**
 * Per-model pricing for OpenAI/JARVIS gateway calls.
 * Rates are in **dollars per 1M tokens** (input / output) and reflect the
 * configured provider pricing.
 *
 * estimateCostCents() returns a *cents* value (rounded up to at least 1
 * if any tokens were used) so the api_usage_log dashboard reflects real spend
 * — not the legacy hardcoded 3¢/token multiplier which over-reported by ~6,000×.
 */

type Rate = { in: number; out: number }; // USD per 1M tokens

const PRICING: Record<string, Rate> = {
  // OpenAI
  "gpt-5":      { in: 1.25, out: 10.00 },
  "gpt-5.2":    { in: 1.25, out: 10.00 },
  "gpt-5-mini": { in: 0.25, out: 2.00 },
  "gpt-5-nano": { in: 0.05, out: 0.40 },
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
  // Store with 4-decimal precision so small AI calls do not get rounded up.
  return Math.round(cents * 10000) / 10000;
}
