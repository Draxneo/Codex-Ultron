import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CustomerEquipment = {
  id: string;
  customer_id: string;
  equipment_type: string;
  brand: string | null;
  model_number: string | null;
  serial_number: string | null;
  install_date: string | null;
  location_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function useCustomerEquipment(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer_equipment", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_equipment" as any)
        .select("*")
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CustomerEquipment[];
    },
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CustomerEquipment, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("customer_equipment" as any)
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["customer_equipment", vars.customer_id] }),
  });
}

export function useDeleteEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, customerId }: { id: string; customerId: string }) => {
      const { error } = await supabase
        .from("customer_equipment" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      return customerId;
    },
    onSuccess: (customerId) => qc.invalidateQueries({ queryKey: ["customer_equipment", customerId] }),
  });
}
