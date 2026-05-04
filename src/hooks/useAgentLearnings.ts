import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type AgentLearning = {
  id: string;
  trigger: string;
  correction: string;
  instruction_slug: string | null;
  created_at: string;
};

export function useAgentLearnings() {
  return useQuery({
    queryKey: ["agent_learnings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_learnings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as AgentLearning[];
    },
  });
}

export function useDeleteLearning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_learnings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_learnings"] });
      toast({ title: "Learning deleted" });
    },
  });
}
