import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Customer } from "@/hooks/useCustomers";
import type { CustomerEnrichment } from "@/hooks/useCustomerEnrichment";
import { normalizeLast10 } from "@/lib/formatters";

export type EnrichedCustomer = Customer & {
  enrichment: CustomerEnrichment & {
    last_contact_at?: string | null;
    last_contact_type?: "call" | "sms" | null;
    last_contact_direction?: string | null;
    last_contact_preview?: string | null;
  };
};

type PaginatedResult = {
  customers: EnrichedCustomer[];
  totalCount: number;
  pageSize: number;
};

export type CustomerDirectorySort = "recent_contact" | "recent_job" | "az";

type ContactTouch = {
  phone: string;
  at: string;
  type: "call" | "sms";
  direction: string | null;
  preview: string | null;
};

function mapCustomerRow(r: any): EnrichedCustomer {
  return {
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
  };
}

async function getRecentContactTouches() {
  const [calls, sms] = await Promise.all([
    supabase
      .from("call_log" as any)
      .select("phone_number, direction, status, started_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("sms_log" as any)
      .select("phone_number, direction, body, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (calls.error) throw calls.error;
  if (sms.error) throw sms.error;

  const touches: ContactTouch[] = [
    ...((calls.data || []) as any[]).map((row) => ({
      phone: normalizeLast10(row.phone_number),
      at: row.started_at || row.created_at,
      type: "call" as const,
      direction: row.direction || null,
      preview: row.status || "Call",
    })),
    ...((sms.data || []) as any[]).map((row) => ({
      phone: normalizeLast10(row.phone_number),
      at: row.created_at,
      type: "sms" as const,
      direction: row.direction || null,
      preview: row.body || "Text message",
    })),
  ]
    .filter((touch) => touch.phone && touch.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const latestByPhone = new Map<string, ContactTouch>();
  for (const touch of touches) {
    if (!latestByPhone.has(touch.phone)) latestByPhone.set(touch.phone, touch);
  }

  return latestByPhone;
}

/**
 * Server-side paginated + enriched customer query.
 * Replaces useCustomers + useRecentCustomers + useCustomerEnrichment on the Customers page.
 * ONE query, ONE source of truth.
 */
export function useCustomersPaginated(opts: {
  search: string;
  sortBy: CustomerDirectorySort;
  page: number;
  pageSize?: number;
  letter?: string | null;
}) {
  const { search, sortBy, page, pageSize = 50, letter } = opts;
  const serverSort = sortBy === "az" ? "az" : "recent";
  const needsContactSort = sortBy === "recent_contact";
  const fetchSize = needsContactSort ? 5000 : pageSize;
  const fetchPage = needsContactSort ? 0 : page;

  return useQuery<PaginatedResult>({
    queryKey: ["customers_paginated", search, sortBy, page, pageSize, letter],
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customers_paginated" as any, {
        p_search: search || "",
        p_sort_by: serverSort,
        p_page_num: fetchPage,
        p_page_size: fetchSize,
        p_letter: letter || null,
      });
      if (error) throw error;

      const rows = (data as any[]) || [];
      const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
      let customers: EnrichedCustomer[] = rows.map(mapCustomerRow);

      if (needsContactSort) {
        const latestByPhone = await getRecentContactTouches();
        customers = customers
          .map((customer) => {
            const phones = [customer.phone, customer.mobile_phone].map(normalizeLast10).filter(Boolean);
            const latest = phones
              .map((phone) => latestByPhone.get(phone))
              .filter(Boolean)
              .sort((a, b) => new Date(b!.at).getTime() - new Date(a!.at).getTime())[0];

            return {
              ...customer,
              enrichment: {
                ...customer.enrichment,
                last_contact_at: latest?.at || null,
                last_contact_type: latest?.type || null,
                last_contact_direction: latest?.direction || null,
                last_contact_preview: latest?.preview || null,
              },
            };
          })
          .sort((a, b) => {
            const aContact = a.enrichment.last_contact_at
              ? new Date(a.enrichment.last_contact_at).getTime()
              : 0;
            const bContact = b.enrichment.last_contact_at
              ? new Date(b.enrichment.last_contact_at).getTime()
              : 0;
            if (aContact !== bContact) return bContact - aContact;

            const aJob = a.enrichment.last_job_date ? new Date(a.enrichment.last_job_date).getTime() : 0;
            const bJob = b.enrichment.last_job_date ? new Date(b.enrichment.last_job_date).getTime() : 0;
            return bJob - aJob;
          });

        const from = page * pageSize;
        customers = customers.slice(from, from + pageSize);
      }

      return { customers, totalCount, pageSize };
    },
  });
}
