/**
 * Shared helper: fetch the configured AI model for a given task key.
 * Falls back to a sensible default if no row exists.
 */

const DEFAULTS: Record<string, string> = {
  copilot_chat: "google/gemini-3-flash-preview",
  daily_briefing: "google/gemini-3-flash-preview",
  email_classification: "google/gemini-2.5-flash",
  vision_extraction: "google/gemini-2.5-flash",
  sms_auto_reply: "google/gemini-2.5-flash",
  customer_parsing: "google/gemini-3-flash-preview",
  tech_form: "google/gemini-3-flash-preview",
  portal_chat: "google/gemini-3-flash-preview",
  follow_up: "google/gemini-2.5-flash-lite",
  call_todo_extraction: "google/gemini-2.5-flash-lite",
};

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
    if (data?.model) return data.model;
  } catch (e) {
    console.error(`getTaskModel(${taskKey}) error:`, e);
  }
  return DEFAULTS[taskKey] || "google/gemini-3-flash-preview";
}
