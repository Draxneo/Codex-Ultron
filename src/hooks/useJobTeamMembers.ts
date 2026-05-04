import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type JobTeamMember = {
  id: string;
  job_id: string;
  employee_id: string | null;
  employee_name: string;
  role: string;
  is_primary: boolean;
  added_at: string;
};

export function useJobTeamMembers(jobId?: string | null) {
  return useQuery({
    queryKey: ["job_team_members", jobId || null],
    enabled: Boolean(jobId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_team_members" as any)
        .select("*")
        .eq("job_id", jobId)
        .order("is_primary", { ascending: false })
        .order("added_at", { ascending: true });
      if (error) throw error;
      return (data || []) as JobTeamMember[];
    },
  });
}

export function useAddJobTeamMember(jobId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (member: { employee_id?: string | null; employee_name: string; role?: string; is_primary?: boolean }) => {
      if (!jobId) throw new Error("No job selected");
      const { error } = await supabase
        .from("job_team_members" as any)
        .upsert({
          job_id: jobId,
          employee_id: member.employee_id || null,
          employee_name: member.employee_name,
          role: member.role || "helper",
          is_primary: member.is_primary === true,
        }, { onConflict: "job_id,employee_name" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_team_members", jobId || null] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dispatch-live-cards"] });
    },
  });
}

export function useRemoveJobTeamMember(jobId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("job_team_members" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_team_members", jobId || null] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dispatch-live-cards"] });
    },
  });
}

