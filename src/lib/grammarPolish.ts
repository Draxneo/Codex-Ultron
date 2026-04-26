import { supabase } from "@/integrations/supabase/client";

/**
 * Calls the grammar-polish edge function to correct grammar/spelling.
 * Falls back to original text if the call fails.
 */
export async function polishText(
  text: string,
  context: "sms" | "email" | "chat" = "chat"
): Promise<string> {
  if (!text || text.trim().length < 3) return text;

  try {
    const { data, error } = await supabase.functions.invoke("grammar-polish", {
      body: { text, context },
    });
    if (error) {
      console.warn("Grammar polish failed, using original:", error);
      return text;
    }
    return data?.polished || text;
  } catch (e) {
    console.warn("Grammar polish error, using original:", e);
    return text;
  }
}
