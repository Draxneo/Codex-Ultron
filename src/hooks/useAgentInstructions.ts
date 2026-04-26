import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type AgentInstruction = {
  id: string;
  label: string;
  slug: string;
  content: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function useAgentInstructions() {
  return useQuery({
    queryKey: ["agent_instructions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_instructions")
        .select("id, label, slug, content, is_active, sort_order, created_at, updated_at")
        .order("sort_order");
      if (error) throw error;
      return data as AgentInstruction[];
    },
  });
}

export function useUpdateInstruction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content, is_active }: { id: string; content?: string; is_active?: boolean }) => {
      const updates: any = { updated_at: new Date().toISOString() };
      if (content !== undefined) updates.content = content;
      if (is_active !== undefined) updates.is_active = is_active;
      const { error } = await supabase.from("agent_instructions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_instructions"] });
    },
  });
}

export function useAddInstruction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, slug, content }: { label: string; slug: string; content?: string }) => {
      const { error } = await supabase.from("agent_instructions").insert({ label, slug, content: content || "" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_instructions"] });
      toast({ title: "Instruction added" });
    },
  });
}

export function useDeleteInstruction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_instructions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_instructions"] });
      toast({ title: "Instruction deleted" });
    },
  });
}
