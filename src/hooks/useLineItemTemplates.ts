import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface LineItemTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  base_price: number;
  kind: string;
  category: string;
  rules: Record<string, any>;
  auto_add_for: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const KEY = ["line_item_templates"];

export function useLineItemTemplates() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("line_item_templates" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LineItemTemplate[];
    },
  });
}

export function useActiveTemplatesForJobType(jobType: string) {
  return useQuery({
    queryKey: [...KEY, "active", jobType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("line_item_templates" as any)
        .select("*")
        .eq("is_active", true)
        .contains("auto_add_for", [jobType])
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as LineItemTemplate[];
    },
    enabled: !!jobType,
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Partial<LineItemTemplate> & { id?: string }) => {
      const payload = { ...template, updated_at: new Date().toISOString() };
      if (template.id) {
        const { error } = await supabase
          .from("line_item_templates" as any)
          .update(payload as any)
          .eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("line_item_templates" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: "Template saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("line_item_templates" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: "Template deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

/**
 * Resolve line item prices from templates for a given job context.
 * Returns items ready to insert into job_line_items.
 */
export function resolveLineItems(
  templates: LineItemTemplate[],
  context: {
    hasPlan: boolean;
    planSource?: 'install_included' | 'purchased' | null;
    planAnnualPrice?: number;
  }
): Array<{ name: string; description: string | null; kind: string; quantity: number; unit_price: number; total_price: number; template_id: string; }> {
  // Filter templates by plan source requirement
  const filtered = templates.filter((t) => {
    const required = t.rules?.requires_plan_source;
    if (!required) return true; // no restriction
    if (!context.planSource) return false; // needs plan but customer has none
    return required === context.planSource;
  });

  return filtered.map((t) => {
    let price = Number(t.base_price);
    const rules = t.rules || {};

    // Plan member pricing
    if (context.hasPlan) {
      if (rules.show_as_complimentary) {
        price = 0;
      } else if (typeof rules.plan_pct_of_annual === "number" && context.planAnnualPrice) {
        price = context.planAnnualPrice * (rules.plan_pct_of_annual / 100);
      } else if (typeof rules.plan_member_price === "number") {
        price = rules.plan_member_price;
      }
    }

    const qty = rules.qty_default || 1;

    return {
      name: t.name,
      description: rules.customer_facing_note || t.description || null,
      kind: t.kind,
      quantity: qty,
      unit_price: price,
      total_price: price * qty,
      template_id: t.id,
    };
  });
}
