import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ServiceAgreement = {
  id: string;
  customer_id: string;
  plan_name: string;
  plan_type: string;
  frequency: string;
  price: number;
  start_date: string;
  end_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  agreement_discount_percent: number;
  total_visits: number;
  visits_used: number;
  plan_source: 'install_included' | 'purchased';
};

/** Check if a customer has an active agreement and return discount info + perks + planSource */
export async function getCustomerAgreementDiscount(customerId: string): Promise<
  { hasAgreement: true; discountPercent: number; planName: string; perks: string[]; planSource: 'install_included' | 'purchased'; planAnnualPrice: number } |
  { hasAgreement: false; perks: string[]; planSource: null }
> {
  // Always fetch default plan perks as fallback / sales opportunity
  const { data: defaultPlan } = await supabase
    .from("maintenance_plan_templates" as any)
    .select("perks")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1);
  const defaultPerks = (defaultPlan?.[0] as any)?.perks || [];

  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("service_agreements" as any)
    .select("plan_name, agreement_discount_percent, plan_source, price")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .gte("end_date", today)
    .order("end_date", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return { hasAgreement: false, perks: defaultPerks, planSource: null };

  const row = data[0] as any;

  // Try to find perks from the matching plan template
  let perks: string[] = defaultPerks;
  if (row.plan_name) {
    const { data: planMatch } = await supabase
      .from("maintenance_plan_templates" as any)
      .select("perks")
      .eq("name", row.plan_name)
      .limit(1);
    if (planMatch?.[0] && (planMatch[0] as any).perks?.length > 0) {
      perks = (planMatch[0] as any).perks;
    }
  }

  return {
    hasAgreement: true,
    discountPercent: row.agreement_discount_percent || 15,
    planName: row.plan_name,
    perks,
    planSource: (row.plan_source || 'purchased') as 'install_included' | 'purchased',
    planAnnualPrice: Number(row.price) || 199,
  };
}

/** Hook to check agreement visit status for agreements with remaining visits */
export function useAgreementVisitsDue() {
  return useQuery({
    queryKey: ["agreement_visits_due"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("service_agreements" as any)
        .select("*, customers!inner(first_name, last_name, phone)")
        .eq("status", "active")
        .gte("end_date", today);
      if (error) throw error;
      return ((data || []) as unknown as (ServiceAgreement & { customers: { first_name: string; last_name: string; phone: string } })[])
        .filter(a => a.visits_used < a.total_visits);
    },
    refetchInterval: 60000,
  });
}

export function useServiceAgreements() {
  return useQuery({
    queryKey: ["service_agreements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_agreements" as any)
        .select("id, customer_id, plan_name, plan_type, frequency, price, start_date, end_date, status, notes, created_at, updated_at, agreement_discount_percent, total_visits, visits_used, plan_source")
        .order("end_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ServiceAgreement[];
    },
  });
}

export function useCustomerAgreements(customerId: string | undefined) {
  return useQuery({
    queryKey: ["service_agreements", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_agreements" as any)
        .select("id, customer_id, plan_name, plan_type, frequency, price, start_date, end_date, status, notes, created_at, updated_at, agreement_discount_percent, total_visits, visits_used, plan_source")
        .eq("customer_id", customerId!)
        .order("end_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ServiceAgreement[];
    },
  });
}

export function useExpiringAgreements(withinDays = 30) {
  return useQuery({
    queryKey: ["expiring_agreements", withinDays],
    queryFn: async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + withinDays);
      const { data, error } = await supabase
        .from("service_agreements" as any)
        .select("*, customers!inner(first_name, last_name, phone)")
        .eq("status", "active")
        .lte("end_date", futureDate.toISOString().split("T")[0])
        .order("end_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as (ServiceAgreement & { customers: { first_name: string; last_name: string; phone: string } })[];
    },
  });
}

export function useCreateAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ServiceAgreement, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("service_agreements" as any)
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_agreements"] }),
  });
}

export function useUpdateAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceAgreement> & { id: string }) => {
      const { error } = await supabase
        .from("service_agreements" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_agreements"] }),
  });
}
