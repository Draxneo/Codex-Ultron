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

type ServiceRepairItemRow = {
  id: string;
  job_id: string;
  description: string;
  severity: string;
  suggested_price: number | string | null;
  final_price: number | string | null;
  customer_description: string | null;
  source: string | null;
  created_at: string;
};

function toJobRepairItem(row: ServiceRepairItemRow): JobRepairItem {
  const unitPrice = Number(row.final_price || row.suggested_price || 0);
  return {
    id: row.id,
    job_id: row.job_id,
    pricebook_item_id: null,
    name: row.description,
    quantity: 1,
    unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
    severity: row.severity || "recommended",
    notes: row.customer_description,
    added_by: row.source,
    created_at: row.created_at,
  };
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
    queryKey: ["service_repair_items", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_repair_items")
        .select("id, job_id, description, severity, suggested_price, final_price, customer_description, source, created_at")
        .eq("job_id", jobId!)
        .order("created_at");
      if (error) throw error;
      return ((data ?? []) as ServiceRepairItemRow[]).map(toJobRepairItem);
    },
  });
}

export function useAddRepairItem(jobId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { pricebook_item_id?: string; name: string; unit_price: number; added_by?: string }) => {
      if (!jobId) throw new Error("No job ID");
      const { error } = await supabase.from("service_repair_items").insert({
        job_id: jobId,
        description: item.name,
        suggested_price: item.unit_price,
        final_price: item.unit_price,
        source: item.added_by ? `tech:${item.added_by}` : "tech-pricebook",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_repair_items", jobId] });
      qc.invalidateQueries({ queryKey: ["dispatch-live-cards"] });
    },
  });
}

export function useRemoveRepairItem(jobId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("service_repair_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_repair_items", jobId] });
      qc.invalidateQueries({ queryKey: ["dispatch-live-cards"] });
    },
  });
}
