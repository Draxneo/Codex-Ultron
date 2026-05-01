import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export type UnifiedCommunicationType = "sms" | "call" | "voicemail";
export type UnifiedCommunicationChannel = "sms" | "call";

export type UnifiedCommunication = {
  communication_id: string;
  source_id: string;
  source_table: "sms_log" | "call_log" | "voicemails" | string;
  source_type: UnifiedCommunicationType;
  intake_channel: UnifiedCommunicationChannel;
  direction: "inbound" | "outbound" | string;
  event_at: string;
  day_ct: string | null;
  time_ct: string | null;
  phone_number: string;
  phone_last10: string | null;
  contact_name: string | null;
  contact_type: string | null;
  customer_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  hcp_job_number: string | null;
  job_number: string | null;
  estimate_number: string | null;
  summary_text: string | null;
  body: string | null;
  transcription: string | null;
  ai_summary: string | null;
  recording_url: string | null;
  media_urls: unknown;
  twilio_sid: string | null;
  message_sid: string | null;
  delivery_status: string | null;
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  is_read: boolean | null;
  source_function: string | null;
  template_key: string | null;
  intake_status: "open" | "handled" | string;
  handled_by_user_id: string | null;
  handled_by_name: string | null;
  handled_at: string | null;
  intake_status_updated_at: string | null;
  metadata: Record<string, any> | null;
};

type UseUnifiedCommunicationsOptions = {
  limit?: number;
  offset?: number;
  view?: "all" | "recent" | "now" | "handled" | "answering";
  search?: string | null;
  enabled?: boolean;
};

export function useUnifiedCommunications(options: UseUnifiedCommunicationsOptions = {}) {
  const {
    limit = 250,
    offset = 0,
    view = "all",
    search = null,
    enabled = true,
  } = options;

  const queryKey = ["unified-communications", limit, offset, view, search || ""];

  const query = useQuery({
    queryKey,
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_unified_communications", {
        p_limit: limit,
        p_offset: offset,
        p_view: view,
        p_search: search,
      });

      if (error) throw error;
      return (data || []) as UnifiedCommunication[];
    },
  });

  useRealtimeInvalidation(
    enabled
      ? [
          { table: "sms_log", queryKeys: [["unified-communications"]] },
          { table: "call_log", queryKeys: [["unified-communications"]] },
          { table: "voicemails", queryKeys: [["unified-communications"]] },
          { table: "intake_thread_status", queryKeys: [["unified-communications"]] },
        ]
      : [],
    "rt-unified-communications"
  );

  return {
    communications: query.data || [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
