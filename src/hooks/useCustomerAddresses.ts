import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type CustomerAddress = {
  id: string;
  customer_id: string;
  hcp_address_id: string | null;
  address_type: string;
  is_primary: boolean;
  street: string | null;
  street_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: string | null;
  longitude: string | null;
  created_at: string;
  updated_at: string;
};

export function useCustomerAddresses(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer_addresses", customerId],
    enabled: !!customerId,
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("customer_id", customerId!)
        .order("is_primary", { ascending: false })
        .order("address_type", { ascending: true });
      if (error) throw error;
      return (data || []) as CustomerAddress[];
    },
  });
}

export function useCreateCustomerAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (address: Partial<CustomerAddress> & { customer_id: string }) => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .insert(address as any)
        .select()
        .single();
      if (error) throw error;
      return data as CustomerAddress;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["customer_addresses", data.customer_id] });
      toast({ title: "Address added" });
    },
    onError: (err: any) => {
      toast({ title: "Error adding address", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteCustomerAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, customer_id }: { id: string; customer_id: string }) => {
      const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
      if (error) throw error;
      return customer_id;
    },
    onSuccess: (customer_id) => {
      qc.invalidateQueries({ queryKey: ["customer_addresses", customer_id] });
      toast({ title: "Address removed" });
    },
    onError: (err: any) => {
      toast({ title: "Error removing address", description: err.message, variant: "destructive" });
    },
  });
}
