import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APP_ACTION_GO_LIVE_ISO } from "@/lib/appLifecycle";

export function useStripeEvents(filters?: { status?: string; search?: string }) {
  return useQuery({
    queryKey: ["stripe_events", filters],
    queryFn: async () => {
      let q = supabase
        .from("stripe_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters?.status && filters.status !== "all") {
        q = q.eq("status", filters.status);
      }
      if (filters?.search) {
        q = q.or(`customer_email.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function usePaymentsSummary() {
  const invoicesQuery = useQuery({
    queryKey: ["payments_summary_invoices"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: paid, error: paidError } = await supabase
        .from("customer_invoices")
        .select("total")
        .eq("status", "paid")
        .gte("paid_at", startOfMonth);
      if (paidError) throw paidError;

      const { data: outstanding, error: outstandingError } = await supabase
        .from("customer_invoices")
        .select("total")
        .in("status", ["draft", "sent"])
        .gte("created_at", APP_ACTION_GO_LIVE_ISO);
      if (outstandingError) throw outstandingError;

      const { data: agreements, error: agreementsError } = await supabase
        .from("service_agreements")
        .select("id")
        .not("stripe_subscription_id", "is", null)
        .eq("status", "active");
      if (agreementsError) throw agreementsError;

      const collectedThisMonth = (paid || []).reduce((s, i) => s + Number(i.total), 0);
      const outstandingTotal = (outstanding || []).reduce((s, i) => s + Number(i.total), 0);
      const activeSubscriptions = (agreements || []).length;

      return { collectedThisMonth, outstandingTotal, activeSubscriptions };
    },
  });

  const failedQuery = useQuery({
    queryKey: ["payments_summary_failed"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data, error } = await supabase
        .from("stripe_events")
        .select("id")
        .eq("status", "failed")
        .gte("created_at", startOfMonth);
      if (error) throw error;

      return (data || []).length;
    },
  });

  return {
    collectedThisMonth: invoicesQuery.data?.collectedThisMonth ?? 0,
    outstandingTotal: invoicesQuery.data?.outstandingTotal ?? 0,
    activeSubscriptions: invoicesQuery.data?.activeSubscriptions ?? 0,
    failedCount: failedQuery.data ?? 0,
    isLoading: invoicesQuery.isLoading || failedQuery.isLoading,
    isError: invoicesQuery.isError || failedQuery.isError,
    error: invoicesQuery.error || failedQuery.error,
  };
}
