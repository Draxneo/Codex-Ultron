/**
 * TierPresetManager — Admin dialog for assigning Good/Better/Best per scope.
 *
 * For each tier, admin picks an `equipment_matchups` row from a searchable
 * select. Saved instantly via useTierPresets.upsert.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Trash2, Award, Sparkles, ShieldCheck } from "lucide-react";
import { useTierPresets, TIER_KEYS, TIER_LABELS, type TierKey } from "@/hooks/useTierPresets";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

interface Props {
  scope: string;
  scopeLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIER_ICON: Record<TierKey, React.ComponentType<{ className?: string }>> = {
  good: ShieldCheck,
  better: Sparkles,
  best: Award,
};

export function TierPresetManager({ scope, scopeLabel, open, onOpenChange }: Props) {
  const { presetsByTier, isLoading, upsert, remove } = useTierPresets(scope);

  const { data: allMatchups = [] } = useQuery({
    queryKey: ["equipment_matchups_all_for_tier_picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_matchups" as any)
        .select("id, brand, tier, tonnage, system_type, condenser_model, total_price, factory_rebate_price")
        .order("brand")
        .order("tonnage")
        .order("tier");
      if (error) throw error;
      return (data || []) as unknown as EquipmentMatchup[];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Curate Good / Better / Best</DialogTitle>
          <DialogDescription>
            Pick the equipment matchup for each tier in <strong>{scopeLabel || scope}</strong>.
            These show up wherever the Good/Better/Best picker is used.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {TIER_KEYS.map((tier) => (
              <TierRow
                key={tier}
                tier={tier}
                preset={presetsByTier[tier]}
                allMatchups={allMatchups}
                onSave={(matchup_id, label) => upsert.mutate({ tier, matchup_id, label })}
                onRemove={() => remove.mutate(tier)}
                isSaving={upsert.isPending}
                Icon={TIER_ICON[tier]}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface RowProps {
  tier: TierKey;
  preset: ReturnType<typeof useTierPresets>["presetsByTier"][TierKey];
  allMatchups: EquipmentMatchup[];
  onSave: (matchup_id: string, label: string | null) => void;
  onRemove: () => void;
  isSaving: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}

function TierRow({ tier, preset, allMatchups, onSave, onRemove, isSaving, Icon }: RowProps) {
  const [matchupId, setMatchupId] = useState<string>(preset?.matchup_id || "");
  const [label, setLabel] = useState<string>(preset?.label || "");

  const selected = useMemo(() => allMatchups.find((m) => m.id === matchupId), [allMatchups, matchupId]);
  const dirty = matchupId !== (preset?.matchup_id || "") || (label || null) !== (preset?.label || null);

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <p className="font-bold text-sm uppercase tracking-wider">{TIER_LABELS[tier]}</p>
        </div>
        {preset && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2">
        <Select value={matchupId} onValueChange={setMatchupId}>
          <SelectTrigger className="text-xs">
            <SelectValue placeholder="Choose equipment matchup..." />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {allMatchups.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.brand} {m.tonnage}T · {m.tier} · {m.condenser_model}
                {m.total_price ? ` · $${Number(m.total_price).toLocaleString()}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Display label (optional)"
          className="text-xs"
        />
        <Button
          size="sm"
          disabled={!matchupId || !dirty || isSaving}
          onClick={() => onSave(matchupId, label.trim() || null)}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>

      {selected && (
        <p className="text-[11px] text-muted-foreground pl-1">
          → {selected.brand} {selected.tonnage}T {selected.tier} · {selected.condenser_model}
        </p>
      )}
    </Card>
  );
}