import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface JarvisSuggestion {
  key: string;
  label: string;
  prompt: string;
  source: "learned" | "ai";
  rank: number;
}

interface SuggestParams {
  context_type: "customer" | "job" | "call" | "sms";
  context_subtype?: string;
  customer_id?: string | null;
  job_id?: string | null;
  phone?: string | null;
  summary?: string | null;
  enabled?: boolean;
}

/** Fetches hybrid AI + learned-preference next-step buttons for a given context. */
export function useJarvisSuggestions(params: SuggestParams) {
  const { user } = useAuth();
  const enabled = (params.enabled ?? true) && !!params.context_type;

  return useQuery({
    queryKey: [
      "jarvis-suggestions",
      params.context_type,
      params.context_subtype,
      params.customer_id,
      params.job_id,
      params.phone,
      user?.id,
    ],
    queryFn: async (): Promise<JarvisSuggestion[]> => {
      const { data, error } = await supabase.functions.invoke("jarvis-suggest-actions", {
        body: {
          context_type: params.context_type,
          context_subtype: params.context_subtype,
          customer_id: params.customer_id,
          job_id: params.job_id,
          phone: params.phone,
          summary: params.summary,
        },
      });
      if (error) throw error;
      return (data?.suggestions ?? []) as JarvisSuggestion[];
    },
    enabled,
    staleTime: 60_000,
  });
}

/** Records that the user clicked a suggestion so future suggestions can re-rank. */
export async function recordSuggestionClick(opts: {
  context_type: string;
  context_subtype?: string | null;
  action_key: string;
  action_label: string;
  customer_id?: string | null;
  job_id?: string | null;
}) {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id;
    if (!uid) return;
    await supabase.from("copilot_button_clicks").insert({
      user_id: uid,
      context_type: opts.context_type,
      context_subtype: opts.context_subtype ?? null,
      action_key: opts.action_key,
      action_label: opts.action_label,
      customer_id: opts.customer_id ?? null,
      job_id: opts.job_id ?? null,
    });
  } catch (e) {
    console.warn("recordSuggestionClick failed:", e);
  }
}
