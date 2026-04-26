import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useActivityLog(jobId?: string) {
  return useQuery({
    queryKey: ["activity_log", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useRecentActivity(limit = 20) {
  return useQuery({
    queryKey: ["recent_activity", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: {
      job_id?: string;
      job_task_id?: string;
      action: string;
      performed_by?: string;
      details?: string;
    }) => {
      const { error } = await supabase.from("activity_log").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity_log"] });
      qc.invalidateQueries({ queryKey: ["recent_activity"] });
    },
  });
}
