import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DiscoveryAnswer {
  id: string;
  field_label: string;
  value: string;
  job_id: string | null;
  created_at: string;
}

/** Fetch all discovery answers for a customer */
export function useCustomerDiscovery(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer_discovery_answers", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_discovery_answers" as any)
        .select("*")
        .eq("customer_id", customerId!)
        .order("field_label");
      if (error) throw error;
      return (data || []) as unknown as DiscoveryAnswer[];
    },
  });
}

/** Upsert a discovery answer for a customer (keyed on customer_id + field_label) */
export async function saveDiscoveryAnswer(
  customerId: string,
  jobId: string | null,
  fieldLabel: string,
  value: string
) {
  const { error } = await supabase
    .from("customer_discovery_answers" as any)
    .upsert(
      {
        customer_id: customerId,
        job_id: jobId,
        field_label: fieldLabel,
        value,
      } as any,
      { onConflict: "customer_id,field_label" } as any
    );
  if (error) console.error("Failed to save discovery answer:", error);
}
