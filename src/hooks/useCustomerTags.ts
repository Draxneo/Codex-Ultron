import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * 2026-05-04: Customer tags for calendar cards and detail surfaces.
 * Used by dispatch calendar to show comfort club badges and other customer tags.
 * Queries customers.tags (text[] array) for a set of customer IDs.
 */
export type CustomerTagMap = Map<string, string[]>;

/**
 * Hook: useCustomerTags
 *
 * Takes a list of customer IDs and returns a Map<customerId, string[]>
 * with the tags array for each customer. Most important tag for now:
 * "Comfort Club" — rendered with a gold Crown icon on calendar cards.
 *
 * Returns an empty array for any customer that has no tags.
 * 5-minute stale time to balance freshness vs query load.
 *
 * Realtime invalidation on customers table changes.
 *
 * Usage:
 *   const { data: tagMap } = useCustomerTags(["cust-123", "cust-456"]);
 *   const tags = tagMap?.get("cust-123") || [];
 *   // ["Comfort Club", "VIP"]
 */
export function useCustomerTags(customerIds: string[] | undefined) {
  return useQuery({
    queryKey: ["customerTags", customerIds?.sort().join(",")],
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!(customerIds && customerIds.length > 0),
    queryFn: async () => {
      if (!customerIds || customerIds.length === 0) {
        return new Map<string, string[]>();
      }

      const uniqueIds = Array.from(new Set(customerIds));

      // Heavy comment per project rules:
      // Fetch customers with their tags array. Returns one row per customer
      // with tags: string[] (e.g., ["Comfort Club", "VIP"]).
      // Filter to include only customers with at least one tag (not empty array).
      const { data, error } = await (supabase as any)
        .from("customers")
        .select("id, tags")
        .in("id", uniqueIds)
        .not("tags", "is", null);

      if (error) throw error;

      // Build the map: customer_id -> tags array.
      // Supabase returns tags as a JSON array, so we can use it directly.
      const map = new Map<string, string[]>();
      for (const row of data || []) {
        const tags = Array.isArray(row.tags) ? row.tags : [];
        if (tags.length > 0) {
          map.set(row.id, tags);
        } else {
          // Still add empty array for consistency so the UI doesn't have to
          // check for undefined/null — just an empty array.
          map.set(row.id, []);
        }
      }

      return map;
    },
  });
}
