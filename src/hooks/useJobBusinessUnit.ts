import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * 2026-05-04: Business unit data for calendar cards.
 * Used by dispatch calendar to label each job/estimate with its company (FIX vs Carnes).
 * Queries customers.primary_business_unit_id → business_units, since jobs/estimates
 * themselves don't carry a business_unit_id directly.
 */
export type BusinessUnitLite = {
  id: string;
  slug: string | null;
  display_name: string | null;
  customer_tag: string | null;
};

/**
 * Hook: useJobBusinessUnit
 *
 * Takes a customer_id (or array of them) and returns a Map<customerId, BusinessUnitLite>
 * with the business unit for each customer. Maps through customers.primary_business_unit_id
 * to the business_units table.
 *
 * Returns null for any customer that has no business unit assigned.
 * 5-minute stale time to balance freshness vs query load.
 *
 * Usage:
 *   const { data: buMap } = useJobBusinessUnit(["cust-123", "cust-456"]);
 *   const bu = buMap?.get("cust-123");
 *   // { id: "bu-1", slug: "carnes", display_name: "Carnes & Sons", customer_tag: "Carnes and Sons" }
 */
export function useJobBusinessUnit(customerIds: string[] | undefined) {
  return useQuery({
    queryKey: ["jobBusinessUnits", customerIds?.sort().join(",")],
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!(customerIds && customerIds.length > 0),
    queryFn: async () => {
      if (!customerIds || customerIds.length === 0) {
        return new Map<string, BusinessUnitLite>();
      }

      const uniqueIds = Array.from(new Set(customerIds));

      // Heavy comment per project rules:
      // Fetch customers with their primary_business_unit_id, then join to
      // business_units to get the slug, display_name, customer_tag.
      // Filter out nulls at the query layer so we return only customers
      // with a business unit assigned.
      const { data, error } = await (supabase as any)
        .from("customers")
        .select(
          `
          id,
          primary_business_unit_id,
          business_units!inner(
            id,
            slug,
            display_name,
            customer_tag
          )
          `
        )
        .in("id", uniqueIds)
        .not("primary_business_unit_id", "is", null);

      if (error) throw error;

      // Build the map: customer_id -> business unit.
      // Supabase returns the nested business_units as an array (even for
      // a single FK), so we grab the first (and only) element.
      const map = new Map<string, BusinessUnitLite>();
      for (const row of data || []) {
        const bu = Array.isArray(row.business_units)
          ? row.business_units[0]
          : row.business_units;

        if (bu) {
          map.set(row.id, {
            id: bu.id,
            slug: bu.slug,
            display_name: bu.display_name,
            customer_tag: bu.customer_tag,
          });
        }
      }

      return map;
    },
  });
}
