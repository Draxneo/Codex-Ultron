/**
 * useQuickQuoteLinks.ts - Create + fetch customer-facing quote links.
 *
 * Each row in `quick_quote_links` snapshots one matchup + rendered quote so the
 * customer page (/q/:token) can display + accept payment-option approval without
 * re-deriving anything. Public read by token; authenticated insert.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import type { CompanyContact, RenderedQuote } from "@/lib/quoteTemplate";

export interface QuickQuoteLink {
  id: string;
  token: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  estimate_id: string | null;
  matchup_snapshot: EquipmentMatchup;
  rendered_snapshot: RenderedQuote | null;
  company_snapshot: CompanyContact | null;
  selected_payment: "A" | "B" | "C" | null;
  approved_at: string | null;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
}

export interface CreateQuickQuoteLinkInput {
  matchup: EquipmentMatchup;
  rendered: RenderedQuote | null;
  company: CompanyContact | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  estimate_id?: string | null;
  job_id?: string | null;
}

export function useQuickQuoteLinkByToken(token: string | undefined) {
  return useQuery({
    queryKey: ["quick_quote_link", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_public_quick_quote_link" as any, { p_token: token! });
      if (error) throw error;
      return data as unknown as QuickQuoteLink | null;
    },
  });
}

export function useCreateQuickQuoteLink() {
  return useMutation({
    mutationFn: async (input: CreateQuickQuoteLinkInput) => {
      const { data, error } = await supabase
        .from("quick_quote_links" as any)
        .insert({
          customer_name: input.customer_name || null,
          customer_phone: input.customer_phone || null,
          customer_email: input.customer_email || null,
          estimate_id: input.estimate_id || null,
          job_id: input.job_id || null,
          matchup_snapshot: input.matchup as any,
          rendered_snapshot: input.rendered as any,
          company_snapshot: input.company as any,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as QuickQuoteLink;
    },
    onError: (e: any) => {
      toast({ title: "Failed to create quote link", description: e.message, variant: "destructive" });
    },
  });
}

export function useApproveQuickQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ token, option }: { token: string; option: "A" | "B" | "C" }) => {
      const { data, error } = await supabase
        .rpc("approve_public_quick_quote" as any, { p_token: token, p_option: option });
      if (error) throw error;

      const { data: autoCreate, error: autoCreateError } = await supabase.functions.invoke("quick-quote-auto-create", {
        body: { token },
      });
      if (autoCreateError) throw autoCreateError;
      if (autoCreate && (autoCreate as any).ok === false) {
        throw new Error((autoCreate as any).error || "Quick quote was approved, but the office handoff needs review.");
      }

      return data as unknown as QuickQuoteLink;
    },
    onSuccess: (_, { token }) => {
      qc.invalidateQueries({ queryKey: ["quick_quote_link", token] });
    },
  });
}

export async function trackQuickQuoteView(token: string, _currentCount: number) {
  await supabase.rpc("track_quick_quote_view" as any, { p_token: token });
}
