import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlanPerkUsage = {
  id: string;
  agreement_id: string;
  customer_id: string;
  perk_type: string;
  description: string;
  job_id: string | null;
  applied_discount: number;
  created_at: string;
};

export function usePlanPerkUsage(customerId: string | undefined) {
  return useQuery({
    queryKey: ["plan_perk_usage", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_perk_usage" as any)
        .select("*")
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PlanPerkUsage[];
    },
  });
}

export function useJobPerkUsage(jobId: string | undefined) {
  return useQuery({
    queryKey: ["plan_perk_usage", "job", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_perk_usage" as any)
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PlanPerkUsage[];
    },
  });
}

export function useCreatePerkUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<PlanPerkUsage, "id" | "created_at">) => {
      const { error } = await supabase
        .from("plan_perk_usage" as any)
        .insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan_perk_usage"] }),
  });
}
