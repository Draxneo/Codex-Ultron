/**
 * Shared helper: fetch the configured AI model for a given task key.
 * Falls back to a sensible default if no row exists.
 */

const DEFAULTS: Record<string, string> = {
  copilot_chat: "gpt-5-mini",
  daily_briefing: "gpt-5-mini",
  email_classification: "gpt-5-mini",
  vision_extraction: "gpt-5-mini",
  sms_auto_reply: "gpt-5-mini",
  customer_parsing: "gpt-5-mini",
  tech_form: "gpt-5-mini",
  portal_chat: "gpt-5-mini",
  follow_up: "gpt-5-mini",
  call_todo_extraction: "gpt-5-mini",
};

export function normalizeOpenAIModel(model?: string | null): string {
  const value = (model || "").trim();
  if (!value) return "gpt-5-mini";
  if (value.startsWith("openai/")) return value.slice("openai/".length);
  if (value.startsWith("google/") || value.startsWith("gemini") || value.startsWith("anthropic/")) {
    return "gpt-5-mini";
  }
  return value;
}

/**
 * Look up the model for `taskKey` from ai_model_config table.
 * @param sb - Supabase client (service role)
 * @param taskKey - one of the known task keys
 */
export async function getTaskModel(sb: any, taskKey: string): Promise<string> {
  try {
    const { data } = await sb
      .from("ai_model_config")
      .select("model")
      .eq("task_key", taskKey)
      .maybeSingle();
    if (data?.model) return normalizeOpenAIModel(data.model);
  } catch (e) {
    console.error(`getTaskModel(${taskKey}) error:`, e);
  }
  return DEFAULTS[taskKey] || "gpt-5-mini";
}
