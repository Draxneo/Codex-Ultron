import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlanTemplate = {
  id: string;
  name: string;
  plan_type: string;
  frequency: string;
  price: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  tier: string;
  perks: any[];
  color: string;
  value_comparison: { item: string; retail: string; member: string }[];
};

export function useMaintenancePlanTemplates(activeOnly = false) {
  return useQuery({
    queryKey: ["maintenance_plan_templates", activeOnly],
    queryFn: async () => {
      let q = supabase
        .from("maintenance_plan_templates" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as PlanTemplate[];
    },
  });
}

export function useCreatePlanTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<PlanTemplate, "id" | "created_at">) => {
      const { error } = await supabase
        .from("maintenance_plan_templates" as any)
        .insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance_plan_templates"] }),
  });
}

export function useUpdatePlanTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PlanTemplate> & { id: string }) => {
      const { error } = await supabase
        .from("maintenance_plan_templates" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance_plan_templates"] }),
  });
}
