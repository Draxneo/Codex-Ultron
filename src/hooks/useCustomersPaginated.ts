import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Customer } from "@/hooks/useCustomers";
import type { CustomerEnrichment } from "@/hooks/useCustomerEnrichment";

export type EnrichedCustomer = Customer & {
  enrichment: CustomerEnrichment;
};

type PaginatedResult = {
  customers: EnrichedCustomer[];
  totalCount: number;
  pageSize: number;
};

/**
 * Server-side paginated + enriched customer query.
 * Replaces useCustomers + useRecentCustomers + useCustomerEnrichment on the Customers page.
 * ONE query, ONE source of truth.
 */
export function useCustomersPaginated(opts: {
  search: string;
  sortBy: "recent" | "az";
  page: number;
  pageSize?: number;
  letter?: string | null;
}) {
  const { search, sortBy, page, pageSize = 50, letter } = opts;

  return useQuery<PaginatedResult>({
    queryKey: ["customers_paginated", search, sortBy, page, pageSize, letter],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customers_paginated" as any, {
        p_search: search || "",
        p_sort_by: sortBy,
        p_page_num: page,
        p_page_size: pageSize,
        p_letter: letter || null,
      });
      if (error) throw error;

      const rows = (data as any[]) || [];
      const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;

      const customers: EnrichedCustomer[] = rows.map((r: any) => ({
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        company: r.company,
        email: r.email,
        phone: r.phone,
        mobile_phone: r.mobile_phone,
        address: r.address,
        city: r.city,
        state: r.state,
        zip: r.zip,
        notes: r.notes,
        tags: r.tags,
        hcp_customer_id: r.hcp_customer_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
        enrichment: {
          customer_id: r.id,
          job_count: Number(r.job_count) || 0,
          has_install: r.has_install || false,
          last_job_date: r.last_job_date,
          agreement_status: r.agreement_status || "none",
          agreement_plan_name: r.agreement_plan_name,
          agreement_end_date: r.agreement_end_date,
          agreement_plan_source: r.agreement_plan_source || null,
        },
      }));

      return { customers, totalCount, pageSize };
    },
  });
}
