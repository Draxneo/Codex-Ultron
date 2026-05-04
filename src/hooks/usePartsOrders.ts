import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartsOrder {
  id: string;
  job_id: string;
  supply_house_id: string | null;
  po_number: string | null;
  description: string | null;
  status: string;
  expected_arrival: string | null;
  ordered_at: string | null;
  picked_up_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  supply_house?: { id: string; name: string; address: string | null; phone: string | null } | null;
}

export function usePartsOrders(jobId: string | undefined) {
  return useQuery({
    queryKey: ["parts_orders", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parts_orders" as any)
        .select("*, supply_houses(id, name, address, phone)")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        supply_house: d.supply_houses || null,
      })) as PartsOrder[];
    },
  });
}

export function useCreatePartsOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: {
      job_id: string;
      supply_house_id?: string;
      po_number?: string;
      description?: string;
      status?: string;
      expected_arrival?: string;
      created_by?: string;
    }) => {
      const { error } = await supabase.from("parts_orders" as any).insert(order as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["parts_orders", vars.job_id] });
    },
  });
}

export function useUpdatePartsOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, jobId, ...updates }: { id: string; jobId: string; status?: string; picked_up_at?: string; po_number?: string; expected_arrival?: string; description?: string }) => {
      const { error } = await supabase
        .from("parts_orders" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["parts_orders", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["hud_parts_ready"] });
    },
  });
}

export function useDeletePartsOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, jobId }: { id: string; jobId: string }) => {
      const { error } = await supabase.from("parts_orders" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["parts_orders", vars.jobId] });
    },
  });
}
