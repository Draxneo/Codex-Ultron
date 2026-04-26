import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomerOverview {
  customer: any;
  lifetime_value: number;
  outstanding_balance: number;
  job_count: number;
  last_job_date: string | null;
  has_install: boolean;
  agreement: { status: string; plan_name: string; end_date: string } | null;
  upcoming_appointments: any[];
  addresses: any[];
  recent_notes: any[];
  latest_portal_invite: any | null;
  tag_list: string[] | null;
}

export function useCustomerOverview(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-overview", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_overview" as any, {
        p_customer_id: customerId!,
      });
      if (error) throw error;
      return data as unknown as CustomerOverview;
    },
  });
}

export function useCustomerActivityFeed(customerId: string | undefined, page = 0, pageSize = 30) {
  return useQuery({
    queryKey: ["customer-activity-feed", customerId, page],
    enabled: !!customerId,
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from("customer_activity_feed" as any)
        .select("*", { count: "exact" })
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data as any[]) || [], total: count || 0 };
    },
  });
}

export function useCustomerNotes(customerId: string | undefined, scope?: string) {
  return useQuery({
    queryKey: ["customer-notes", customerId, scope ?? "all"],
    enabled: !!customerId,
    queryFn: async () => {
      let q = supabase
        .from("customer_notes" as any)
        .select("*")
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false });
      if (scope && scope !== "all") q = q.eq("scope", scope);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function useAddCustomerNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      customer_id: string;
      body: string;
      scope?: "customer" | "estimate" | "job";
      entity_id?: string | null;
      author_name?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("customer_notes" as any)
        .insert({
          customer_id: input.customer_id,
          body: input.body,
          scope: input.scope ?? "customer",
          entity_id: input.entity_id ?? null,
          author_id: u?.user?.id ?? null,
          author_name: input.author_name ?? u?.user?.email ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["customer-notes", vars.customer_id] });
      qc.invalidateQueries({ queryKey: ["customer-overview", vars.customer_id] });
      qc.invalidateQueries({ queryKey: ["customer-activity-feed", vars.customer_id] });
    },
  });
}

export function useDeleteCustomerNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; customer_id: string }) => {
      const { error } = await supabase.from("customer_notes" as any).delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["customer-notes", vars.customer_id] });
    },
  });
}

export function useCustomerPortalInvites(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-portal-invites", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_portal_invites" as any)
        .select("*")
        .eq("customer_id", customerId!)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function useSendPortalInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customer_id: string; email?: string; phone?: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("customer_portal_invites" as any)
        .insert({
          customer_id: input.customer_id,
          email: input.email ?? null,
          phone: input.phone ?? null,
          sent_by: u?.user?.id ?? null,
          sent_by_name: u?.user?.email ?? null,
          status: "sent",
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["customer-portal-invites", vars.customer_id] });
      qc.invalidateQueries({ queryKey: ["customer-overview", vars.customer_id] });
    },
  });
}
