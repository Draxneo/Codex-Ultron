/**
 * Lightweight API usage logger for cost tracking.
 * Import in any edge function that calls an external API.
 */

interface ApiUsageEntry {
  service: string;        // google_maps, twilio_sms, twilio_voice, deepgram, lovable_ai, sendgrid, firecrawl
  function_name: string;  // edge function name e.g. "calculate-route-cache"
  endpoint?: string;      // specific API endpoint e.g. "directions", "geocode"
  tokens_used?: number;   // total tokens (input + output) — kept for back-compat
  input_tokens?: number;  // optional split for accurate cost calc
  output_tokens?: number;
  estimated_cost_cents?: number;
  metadata?: Record<string, unknown>;
}

export async function logApiUsage(
  supabase: { from: (table: string) => any },
  entry: ApiUsageEntry
): Promise<void> {
  try {
    const meta: Record<string, unknown> = { ...(entry.metadata || {}) };
    if (entry.input_tokens != null) meta.input_tokens = entry.input_tokens;
    if (entry.output_tokens != null) meta.output_tokens = entry.output_tokens;
    await supabase.from("api_usage_log").insert({
      service: entry.service,
      function_name: entry.function_name,
      endpoint: entry.endpoint || null,
      tokens_used: entry.tokens_used || null,
      input_tokens: entry.input_tokens || null,
      output_tokens: entry.output_tokens || null,
      estimated_cost_cents: entry.estimated_cost_cents ?? 0,
      cost: entry.estimated_cost_cents ?? 0,
      model: entry.service,
      status: "ok",
      metadata: Object.keys(meta).length ? meta : null,
    });
  } catch (e) {
    // Never let logging break the calling function
    console.warn("api_usage_log insert failed:", e);
  }
}
