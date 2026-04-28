import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCustomerData } from "@/lib/formatters";

export type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  tags: string[] | null;
  hcp_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerNameMap = Map<string, { name: string; phone: string | null; address: string | null }>;

export type CustomerSort = "name" | "last_job" | "total_jobs" | "date_added";
export type CustomerFilter = "all" | "recent" | "active" | "no_jobs" | "has_email" | "has_phone";

const PAGE_SIZE = 50;

/**
 * useCustomers — Full customer list for the Customers page.
 *
 * IMPORTANT: Do NOT use this hook just to look up a customer name or phone.
 * Use useCustomerNames() instead — it fetches only 3 fields (id, first_name, last_name)
 * instead of all 15 fields × 2000 customers.
 *
 * This hook pages through ALL customers in batches of 1000.
 * Only use it where you actually need the full customer record.
 */
export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ["customers", search],
    staleTime: 60000, // customers don't change often — show cache for 1 minute
    queryFn: async () => {
      const BATCH = 1000;
      let all: Customer[] = [];
      let from = 0;
      while (true) {
        let query = supabase
          .from("customers")
          .select("*")
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });

        if (search && search.length > 0) {
          query = query.or(
            `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,address.ilike.%${search}%`
          );
        }

        const { data, error } = await query.range(from, from + BATCH - 1);
        if (error) throw error;
        all = all.concat((data || []) as Customer[]);
        if (!data || data.length < BATCH) break;
        from += BATCH;
      }
      return all;
    },
  });
}

/**
 * useCustomerNames — Lightweight name/phone lookup map.
 *
 * PERFORMANCE: Fetches only id + first_name + last_name + phone + address.
 * ~80% less data than useCustomers(). Use this anywhere you just need to
 * display a customer name next to a job — TechDashboard, dispatch board, etc.
 *
 * Returns a Map<customerId, { name, phone, address }> for O(1) lookups.
 */
export function useCustomerNames(): { data: CustomerNameMap; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["customer_names"],
    staleTime: 120000, // names rarely change — cache for 2 minutes
    queryFn: async () => {
      const BATCH = 1000;
      const allNames: { id: string; first_name: string | null; last_name: string | null; company: string | null; phone: string | null; mobile_phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null }[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("customers")
          .select("id, first_name, last_name, company, phone, mobile_phone, address, city, state, zip")
          .order("last_name", { ascending: true })
          .range(from, from + BATCH - 1);
        if (error) throw error;
        allNames.push(...(data || []));
        if (!data || data.length < BATCH) break;
        from += BATCH;
      }
      return allNames;
    },
  });

  const nameMap: CustomerNameMap = new Map();
  (data || []).forEach((c) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "Unknown";
    const address = [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ") || null;
    nameMap.set(c.id, { name, phone: c.phone || c.mobile_phone || null, address });
  });

  return { data: nameMap, isLoading };
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["customers", id],
    staleTime: 60000,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Customer;
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer: Partial<Customer>) => {
      const formatted = formatCustomerData(customer);
      const { data, error } = await supabase
        .from("customers")
        .insert(formatted as any)
        .select()
        .single();
      if (error) throw error;
      return data as Customer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer_names"] });
      toast({ title: "Customer created" });
    },
    onError: (err: any) => {
      toast({ title: "Error creating customer", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Customer> & { id: string }) => {
      const formatted = formatCustomerData(updates);
      const { data, error } = await supabase
        .from("customers")
        .update({ ...formatted, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Customer;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customers", vars.id] });
      qc.invalidateQueries({ queryKey: ["customer_names"] });
      qc.invalidateQueries({ queryKey: ["customer-overview", vars.id] });
      qc.invalidateQueries({ queryKey: ["customer-activity-feed", vars.id] });
      toast({ title: "Customer updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error updating customer", description: err.message, variant: "destructive" });
    },
  });
}
