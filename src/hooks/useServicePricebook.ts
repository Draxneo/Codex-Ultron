import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PricebookItem {
  id: string;
  name: string;
  category: string;
  icon_emoji: string;
  base_price: number;
  cost: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface JobRepairItem {
  id: string;
  job_id: string;
  pricebook_item_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  severity: string;
  notes: string | null;
  added_by: string | null;
  created_at: string;
}

export function useServicePricebook() {
  return useQuery<PricebookItem[]>({
    queryKey: ["service_pricebook"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_pricebook")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PricebookItem[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useJobRepairItems(jobId: string | undefined) {
  return useQuery<JobRepairItem[]>({
    queryKey: ["job_repair_items", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_repair_items")
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as JobRepairItem[];
    },
  });
}

export function useAddRepairItem(jobId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { pricebook_item_id?: string; name: string; unit_price: number; added_by?: string }) => {
      if (!jobId) throw new Error("No job ID");
      // Check if this pricebook item already exists for this job — if so, increment quantity
      if (item.pricebook_item_id) {
        const { data: existing } = await supabase
          .from("job_repair_items")
          .select("id, quantity")
          .eq("job_id", jobId)
          .eq("pricebook_item_id", item.pricebook_item_id)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase
            .from("job_repair_items")
            .update({ quantity: existing.quantity + 1 })
            .eq("id", existing.id);
          if (error) throw error;
          return;
        }
      }
      const { error } = await supabase.from("job_repair_items").insert({
        job_id: jobId,
        pricebook_item_id: item.pricebook_item_id || null,
        name: item.name,
        unit_price: item.unit_price,
        added_by: item.added_by || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_repair_items", jobId] }),
  });
}

export function useRemoveRepairItem(jobId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("job_repair_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_repair_items", jobId] }),
  });
}

export function useUpdateRepairItemQty(jobId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      if (quantity <= 0) {
        const { error } = await supabase.from("job_repair_items").delete().eq("id", itemId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("job_repair_items").update({ quantity }).eq("id", itemId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_repair_items", jobId] }),
  });
}
