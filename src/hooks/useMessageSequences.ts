import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface SequenceStep {
  id: string;
  type: "trigger" | "delay" | "send_sms" | "send_email" | "ai_check" | "branch" | "end";
  label: string;
  config: Record<string, any>;
  position?: { x: number; y: number };
}

export interface MessageSequence {
  id: string;
  name: string;
  job_type: string;
  steps: SequenceStep[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useMessageSequences() {
  return useQuery({
    queryKey: ["message_sequences"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("message_sequences")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        steps: typeof d.steps === "string" ? JSON.parse(d.steps) : d.steps,
      })) as MessageSequence[];
    },
  });
}

export function useSaveSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seq: Partial<MessageSequence> & { id?: string }) => {
      const payload = { ...seq, updated_at: new Date().toISOString() };
      if (seq.id) {
        const { error } = await (supabase as any).from("message_sequences").update(payload).eq("id", seq.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("message_sequences").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message_sequences"] });
      toast({ title: "Sequence saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("message_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message_sequences"] });
      toast({ title: "Sequence deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}
