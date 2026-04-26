import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CustomerEnrichment = {
  customer_id: string;
  job_count: number;
  has_install: boolean;
  last_job_date: string | null;
  agreement_status: "active" | "expired" | "none";
  agreement_plan_name: string | null;
  agreement_end_date: string | null;
  agreement_plan_source: "install_included" | "purchased" | null;
};

export type EnrichmentMap = Map<string, CustomerEnrichment>;

/**
 * Fetches enrichment data (install status, returning, agreement) for ALL customers
 * via a single RPC call. Returns a Map keyed by customer_id for O(1) lookups.
 */
export function useCustomerEnrichment() {
  const { data, isLoading } = useQuery({
    queryKey: ["customer_enrichment"],
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_enrichment" as any);
      if (error) throw error;
      return data as unknown as CustomerEnrichment[];
    },
  });

  const map: EnrichmentMap = new Map();
  (data || []).forEach((e) => map.set(e.customer_id, e));

  return { data: map, isLoading };
}
