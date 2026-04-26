/**
 * GoodBetterBestPicker — Universal 3-card tier selector.
 *
 * Reads `tier_presets` for the given scope, hydrates each tier with the live
 * `equipment_matchups` row, and renders Good / Better / Best cards with price
 * + Select button. Caller controls selection.
 *
 * If no presets exist yet for this scope, shows a friendly empty state
 * pointing staff to TierPresetManager.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Loader2, Award, ShieldCheck } from "lucide-react";
import { useTierPresets, TIER_KEYS, TIER_LABELS, TIER_DEFAULT_DESCRIPTIONS, type TierKey } from "@/hooks/useTierPresets";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

interface Props {
  scope: string;
  selectedMatchupId?: string | null;
  onSelect?: (m: EquipmentMatchup, tier: TierKey) => void;
  ctaLabel?: string;
  className?: string;
}

const TIER_ICON: Record<TierKey, React.ComponentType<{ className?: string }>> = {
  good: ShieldCheck,
  better: Sparkles,
  best: Award,
};

const TIER_RING: Record<TierKey, string> = {
  good: "ring-muted-foreground/20",
  better: "ring-primary/40",
  best: "ring-accent/60",
};

const TIER_BADGE: Record<TierKey, string> = {
  good: "bg-muted text-muted-foreground",
  better: "bg-primary text-primary-foreground",
  best: "bg-accent text-accent-foreground",
};

export function GoodBetterBestPicker({
  scope,
  selectedMatchupId,
  onSelect,
  ctaLabel = "Select",
  className = "",
}: Props) {
  const { presetsByTier, isLoading } = useTierPresets(scope);

  const matchupIds = TIER_KEYS.map((t) => presetsByTier[t]?.matchup_id).filter(Boolean) as string[];

  const { data: matchups = [], isLoading: loadingMatchups } = useQuery({
    queryKey: ["matchups_by_ids", matchupIds],
    enabled: matchupIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_matchups" as any)
        .select("*")
        .in("id", matchupIds);
      if (error) throw error;
      return (data || []) as unknown as EquipmentMatchup[];
    },
  });

  if (isLoading || loadingMatchups) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAny = TIER_KEYS.some((t) => presetsByTier[t]);
  if (!hasAny) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-1">
          <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/40" />
          <p className="font-medium text-foreground">No Good/Better/Best curated for this view yet.</p>
          <p>An admin can curate tiers from the Quick Quote tools menu.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`grid gap-3 md:grid-cols-3 ${className}`}>
      {TIER_KEYS.map((tier) => {
        const preset = presetsByTier[tier];
        const m = preset ? matchups.find((x) => x.id === preset.matchup_id) : undefined;
        const Icon = TIER_ICON[tier];
        const isSelected = m && selectedMatchupId === m.id;

        if (!preset || !m) {
          return (
            <Card key={tier} className={`ring-1 ${TIER_RING[tier]} opacity-50`}>
              <CardContent className="p-4 text-center text-xs text-muted-foreground space-y-1">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${TIER_BADGE[tier]}`}>
                  {TIER_LABELS[tier]}
                </span>
                <p className="pt-1">Not curated</p>
              </CardContent>
            </Card>
          );
        }

        const price = m.factory_rebate_price ?? m.total_price ?? 0;
        const monthly = m.monthly_payment;

        return (
          <Card
            key={tier}
            className={`relative overflow-hidden ring-2 transition-all ${
              isSelected ? "ring-primary shadow-lg scale-[1.02]" : TIER_RING[tier]
            }`}
          >
            {isSelected && (
              <div className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                <Check className="h-3.5 w-3.5" />
              </div>
            )}
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${TIER_BADGE[tier]}`}>
                  <Icon className="h-3 w-3" />
                  {TIER_LABELS[tier]}
                </span>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-base leading-tight">
                  {preset.label || `${m.brand} ${m.tonnage}T`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.tier} · SEER2 {m.seer2 ?? "—"}
                  {m.afue ? ` · AFUE ${m.afue}%` : ""}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {TIER_DEFAULT_DESCRIPTIONS[tier]}
                </p>
              </div>
              <div className="border-t pt-2 space-y-0.5">
                <p className="text-2xl font-extrabold text-foreground">
                  ${Number(price).toLocaleString()}
                </p>
                {monthly ? (
                  <p className="text-xs text-muted-foreground">
                    or <strong className="text-primary">${Number(monthly).toFixed(0)}/mo</strong>
                  </p>
                ) : null}
              </div>
              {onSelect && (
                <Button
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="w-full"
                  onClick={() => onSelect(m, tier)}
                >
                  {isSelected ? "Selected" : ctaLabel}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
