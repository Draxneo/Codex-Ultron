import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export type Voicemail = {
  id: string;
  call_log_id: string | null;
  phone_number: string;
  contact_name: string | null;
  contact_type: string;
  recording_url: string | null;
  recording_sid: string | null;
  duration_seconds: number | null;
  transcription: string | null;
  is_read: boolean;
  created_at: string;
};

export function useVoicemails() {
  const queryClient = useQueryClient();

  const { data: voicemails = [], isLoading: loading } = useQuery({
    queryKey: ["voicemails"],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voicemails")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Voicemail[];
    },
  });

  useRealtimeInvalidation(
    [{ table: "voicemails", queryKeys: [["voicemails"]] }],
    "rt-voicemails"
  );

  const unreadCount = useMemo(() => voicemails.filter((v) => !v.is_read).length, [voicemails]);

  const markAsRead = async (id: string) => {
    await supabase.from("voicemails").update({ is_read: true } as any).eq("id", id);
    queryClient.setQueryData<Voicemail[]>(["voicemails"], (old) =>
      (old || []).map((v) => (v.id === id ? { ...v, is_read: true } : v))
    );
  };

  const deleteVoicemail = async (id: string) => {
    await supabase.from("voicemails").delete().eq("id", id);
    queryClient.setQueryData<Voicemail[]>(["voicemails"], (old) =>
      (old || []).filter((v) => v.id !== id)
    );
  };

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["voicemails"] });

  return { voicemails, loading, unreadCount, markAsRead, deleteVoicemail, refetch };
}
