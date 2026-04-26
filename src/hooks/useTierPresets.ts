/**
 * useTierPresets.ts — Universal Good/Better/Best curation.
 *
 * Admins assign which `equipment_matchups` row maps to Good/Better/Best
 * for a given scope (e.g. "quick_quote_default", "cart_install_addon").
 * Read everywhere (public-safe), write requires auth.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type TierKey = "good" | "better" | "best";
export const TIER_KEYS: TierKey[] = ["good", "better", "best"];
export const TIER_LABELS: Record<TierKey, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};
export const TIER_DEFAULT_DESCRIPTIONS: Record<TierKey, string> = {
  good: "Reliable comfort at our best price.",
  better: "Higher efficiency, lower bills, longer warranty.",
  best: "Top-of-the-line comfort, quietest operation, longest life.",
};

export interface TierPreset {
  id: string;
  scope: string;
  tier: TierKey;
  matchup_id: string;
  label: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function useTierPresets(scope: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tier_presets", scope],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tier_presets")
        .select("*")
        .eq("scope", scope)
        .order("display_order");
      if (error) throw error;
      return (data || []) as TierPreset[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: { tier: TierKey; matchup_id: string; label?: string | null }) => {
      const display_order = TIER_KEYS.indexOf(input.tier);
      const existing = query.data?.find((p) => p.tier === input.tier);
      if (existing) {
        const { error } = await (supabase as any)
          .from("tier_presets")
          .update({
            matchup_id: input.matchup_id,
            label: input.label ?? null,
            display_order,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("tier_presets")
          .insert({
            scope,
            tier: input.tier,
            matchup_id: input.matchup_id,
            label: input.label ?? null,
            display_order,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tier_presets", scope] });
      toast({ title: "Tier saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save tier", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (tier: TierKey) => {
      const { error } = await (supabase as any)
        .from("tier_presets")
        .delete()
        .eq("scope", scope)
        .eq("tier", tier);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tier_presets", scope] });
      toast({ title: "Tier cleared" });
    },
  });

  const presetsByTier: Record<TierKey, TierPreset | undefined> = {
    good: query.data?.find((p) => p.tier === "good"),
    better: query.data?.find((p) => p.tier === "better"),
    best: query.data?.find((p) => p.tier === "best"),
  };

  return {
    presets: query.data || [],
    presetsByTier,
    isLoading: query.isLoading,
    upsert,
    remove,
  };
}
