import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Customer } from "@/hooks/useCustomers";

/** Fetch all rows from customers table, paginating past the 1000-row Supabase default */
async function fetchAllCustomers(search?: string): Promise<Customer[]> {
  const PAGE = 1000;
  let all: Customer[] = [];
  let from = 0;
  while (true) {
    let query = supabase.from("customers").select("*");
    if (search && search.length > 0) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,address.ilike.%${search}%`
      );
    }
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat((data || []) as Customer[]);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/**
 * Fetches customers sorted by most recent job date (DESC).
 * Uses the get_customer_job_counts RPC to sort at the database level,
 * then fetches ALL customer records (paginated past the 1000-row limit).
 */
export function useRecentCustomers(search?: string) {
  return useQuery({
    queryKey: ["customers-recent", search],
    queryFn: async () => {
      // Step 1: Get all customer IDs sorted by last_job_date DESC from the RPC
      const { data: jobStats, error: rpcErr } = await supabase
        .rpc("get_customer_job_counts" as any)
        .limit(5000);
      if (rpcErr) throw rpcErr;

      const statsArr = (jobStats as any[]) || [];
      statsArr.sort((a, b) => {
        const da = a.last_job_date || "";
        const db = b.last_job_date || "";
        return db.localeCompare(da);
      });

      const recentIds = statsArr.map((r: any) => r.customer_id as string);

      // Step 2: Fetch ALL customers (paginated past 1000-row limit)
      const allCust = await fetchAllCustomers(search);

      // Step 3: Build a lookup map
      const custMap = new Map<string, Customer>();
      for (const c of allCust) {
        custMap.set(c.id, c);
      }

      // Step 4: Customers with jobs first (by recency), then the rest alphabetically
      const result: Customer[] = [];
      const seen = new Set<string>();

      for (const id of recentIds) {
        const c = custMap.get(id);
        if (c) {
          result.push(c);
          seen.add(id);
        }
      }

      const noJobCustomers = allCust
        .filter(c => !seen.has(c.id))
        .sort((a, b) => {
          const aLn = (a.last_name || a.company || "").toLowerCase();
          const bLn = (b.last_name || b.company || "").toLowerCase();
          if (aLn !== bLn) return aLn.localeCompare(bLn);
          return (a.first_name || "").toLowerCase().localeCompare((b.first_name || "").toLowerCase());
        });

      result.push(...noJobCustomers);
      return result;
    },
  });
}
