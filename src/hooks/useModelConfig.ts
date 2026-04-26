import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ModelConfigRow = {
  id: string;
  task_key: string;
  label: string;
  model: string;
  updated_at: string;
};

export function useModelConfig() {
  const qc = useQueryClient();

  const { data: configs, isLoading } = useQuery({
    queryKey: ["ai_model_config"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_model_config")
        .select("*")
        .order("task_key");
      if (error) throw error;
      return data as ModelConfigRow[];
    },
  });

  const updateModel = useMutation({
    mutationFn: async ({ id, model }: { id: string; model: string }) => {
      const { error } = await (supabase as any)
        .from("ai_model_config")
        .update({ model, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_model_config"] }),
  });

  return { configs, isLoading, updateModel };
}
