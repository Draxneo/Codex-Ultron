import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaymentPlanRule = {
  id: string;
  job_type: string;
  min_amount: number;
  max_amount: number | null;
  max_installments: number;
  is_active: boolean;
  created_at: string;
};

export function usePaymentPlanRules() {
  return useQuery({
    queryKey: ["payment_plan_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_plan_rules" as any)
        .select("*")
        .order("job_type", { ascending: true })
        .order("min_amount", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as PaymentPlanRule[];
    },
  });
}

export function useCreatePaymentPlanRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<PaymentPlanRule, "id" | "created_at">) => {
      const { error } = await supabase
        .from("payment_plan_rules" as any)
        .insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment_plan_rules"] }),
  });
}

export function useUpdatePaymentPlanRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PaymentPlanRule> & { id: string }) => {
      const { error } = await supabase
        .from("payment_plan_rules" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment_plan_rules"] }),
  });
}

export function useDeletePaymentPlanRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_plan_rules" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment_plan_rules"] }),
  });
}

/** Given a job type and invoice total, return the max installments allowed */
export function getMaxInstallments(rules: PaymentPlanRule[], jobType: string | null, total: number): number {
  const active = rules.filter(r => r.is_active);
  // Find matching rules — "all" matches everything, or exact job_type match
  const matching = active.filter(r => {
    const typeMatch = r.job_type === "all" || r.job_type === jobType;
    const minMatch = total >= r.min_amount;
    const maxMatch = r.max_amount === null || total <= r.max_amount;
    return typeMatch && minMatch && maxMatch;
  });
  if (matching.length === 0) return 1; // pay in full only
  // Return the highest max_installments from matching rules
  return Math.max(...matching.map(r => r.max_installments));
}
