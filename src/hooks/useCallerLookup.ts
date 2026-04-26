import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeLast10 } from "@/lib/formatters";
import type { Customer } from "@/hooks/useCustomers";

export function useCallerLookup(phoneNumber: string | null | undefined) {
  const normalized = normalizeLast10(phoneNumber);

  return useQuery({
    queryKey: ["caller_lookup", normalized],
    enabled: normalized.length === 10,
    queryFn: async () => {
      // ONE SOURCE OF TRUTH: use the DB function that strips non-digits server-side
      const { data: match, error } = await supabase
        .rpc("find_customer_by_phone", { digits: normalized })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!match) return null;

      // Fetch full customer record by ID
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .select("*")
        .eq("id", match.id)
        .single();
      if (custErr) throw custErr;
      return (customer as Customer) ?? null;
    },
    staleTime: 30_000,
  });
}
