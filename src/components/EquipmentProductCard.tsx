import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Flame, Snowflake, Zap, Wind, Pencil, Package } from "lucide-react";
import { getFeatureIcon } from "@/components/FeaturesEditor";
import { FeaturesEditor } from "@/components/FeaturesEditor";
import { CatalogImageUpload } from "@/components/CatalogImageUpload";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

const BRAND_COLORS: Record<string, string> = {
  Carrier: "bg-blue-600 text-white",
  "Day and Night": "bg-sky-600 text-white",
  Goodman: "bg-red-600 text-white",
  Trane: "bg-red-700 text-white",
  Armstrong: "bg-slate-700 text-white",
  Ducane: "bg-emerald-700 text-white",
};

const TIER_STYLES: Record<string, { bg: string; text: string; stars: string }> = {
  Value: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", stars: "" },
  "Value Plus": { bg: "bg-gray-200 dark:bg-gray-700", text: "text-gray-700 dark:text-gray-300", stars: "½" },
  Good: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", stars: "⭐" },
  Better: { bg: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-300", stars: "⭐⭐" },
  Best: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", stars: "⭐⭐⭐" },
  Ultimate: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", stars: "👑" },
};

const SYSTEM_ICONS: Record<string, typeof Flame> = {
  gas_heat: Flame,
  heat_pump: Snowflake,
  electric: Zap,
  dual_fuel: Wind,
};

const SYSTEM_LABELS: Record<string, string> = {
  gas_heat: "Gas Heat",
  heat_pump: "Heat Pump",
  electric: "Straight Cool",
  dual_fuel: "Dual Fuel",
};

interface Props {
  matchup: EquipmentMatchup;
  onAddToCart?: (matchup: EquipmentMatchup) => void;
  compact?: boolean;
  editable?: boolean;
}

function normalizeFeatures(value: unknown): { icon: string; text: string }[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item.text === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.text === "string") : [];
  } catch {
    return [];
  }
}

export function EquipmentProductCard({ matchup, onAddToCart, compact, editable }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();
  const brandColor = BRAND_COLORS[matchup.brand] || "bg-primary text-primary-foreground";
  const tierStyle = TIER_STYLES[matchup.tier || "Good"] || TIER_STYLES.Good;
  const SystemIcon = SYSTEM_ICONS[matchup.system_type || "gas_heat"] || Flame;
  const systemLabel = SYSTEM_LABELS[matchup.system_type || "gas_heat"] || matchup.system_type;
  const features = normalizeFeatures(matchup.features_benefits);

  const handleImageChange = async (url: string | null) => {
    await supabase.from("equipment_matchups" as any).update({ image_url: url } as any).eq("id", matchup.id);
    queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
    queryClient.invalidateQueries({ queryKey: ["equipment_search"] });
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow border-border/60 flex flex-col h-full group relative">
        {/* Edit button */}
        {editable && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/80 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Image area */}
        {editable ? (
          <div className="px-4 pt-4">
            <CatalogImageUpload
              currentUrl={(matchup as any).image_url || null}
              bucket="manufacturer-brochures"
              folder="equipment-matchups"
              onUploaded={handleImageChange}
              size="md"
            />
          </div>
        ) : (matchup as any).image_url ? (
          <div className="h-32 w-full overflow-hidden">
            <img src={(matchup as any).image_url} alt={matchup.condenser_model} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-20 w-full bg-muted/30 flex items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground/20" />
          </div>
        )}

        {/* Header: Brand + Tier */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <Badge className={`${brandColor} text-xs font-bold px-2.5 py-0.5 rounded-md`}>
            {matchup.brand}
          </Badge>
          {matchup.tier && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${tierStyle.bg} ${tierStyle.text}`}>
              {tierStyle.stars && <span>{tierStyle.stars}</span>}
              {matchup.tier}
            </span>
          )}
        </div>

        <CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col">
          {/* System type + Tonnage */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <SystemIcon className="h-4 w-4" />
            <span>{systemLabel}</span>
            {matchup.tonnage && (
              <>
                <span className="text-border">·</span>
                <span className="font-semibold text-foreground">{matchup.tonnage} Ton</span>
              </>
            )}
          </div>

          {/* Specs row */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {matchup.seer2 && (
              <Badge variant="outline" className="text-[11px] font-medium tabular-nums">
                {matchup.seer2} SEER2
              </Badge>
            )}
            {matchup.eer2 && (
              <Badge variant="outline" className="text-[11px] font-medium tabular-nums">
                {matchup.eer2} EER2
              </Badge>
            )}
            {matchup.hspf2 && (
              <Badge variant="outline" className="text-[11px] font-medium tabular-nums">
                {matchup.hspf2} HSPF2
              </Badge>
            )}
            {matchup.afue && (
              <Badge variant="outline" className="text-[11px] font-medium tabular-nums">
                {matchup.afue}% AFUE
              </Badge>
            )}
          </div>

          {/* Model numbers */}
          {!compact && (
            <div className="text-[11px] text-muted-foreground space-y-0.5 mb-3">
              <p className="truncate font-mono">{matchup.condenser_model}</p>
              {matchup.furnace_model && <p className="truncate font-mono">{matchup.furnace_model}</p>}
              {matchup.coil_model && <p className="truncate font-mono">{matchup.coil_model}</p>}
            </div>
          )}

          {/* Features */}
          {features.length > 0 ? (
            <div className="space-y-1 mb-3 flex-1">
              {features.slice(0, compact ? 3 : 6).map((f, i) => {
                const FeatureIcon = getFeatureIcon(f.icon);
                return (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <FeatureIcon className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-muted-foreground">{f.text}</span>
                  </div>
                );
              })}
              {features.length > (compact ? 3 : 6) && (
                <p className="text-[10px] text-muted-foreground/60">+{features.length - (compact ? 3 : 6)} more</p>
              )}
            </div>
          ) : editable ? (
            <button
              onClick={() => setEditOpen(true)}
              className="flex-1 mb-3 border border-dashed border-border/60 rounded-md flex items-center justify-center py-3 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:border-primary/40 transition-colors"
            >
              + Add features & benefits
            </button>
          ) : (
            <div className="flex-1" />
          )}

          {/* CPS Rebate badge */}
          {matchup.cps_rebate_tier && (
            <div className="mb-3">
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]">
                CPS {matchup.cps_rebate_tier} — Up to ${(matchup.early_rebate || 0).toLocaleString()}
              </Badge>
            </div>
          )}

          {/* Price block */}
          <div className="border-t border-border/50 pt-3 mt-auto">
            <div className="flex items-baseline justify-between">
              <p className="text-xl font-bold text-foreground tabular-nums">
                ${(matchup.total_price || 0).toLocaleString()}
              </p>
              {matchup.monthly_payment && (
                <p className="text-sm font-semibold text-primary tabular-nums">
                  ${matchup.monthly_payment}/mo
                </p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              0% APR for 36 months
            </p>
            {matchup.factory_rebate_price && matchup.factory_rebate_price !== matchup.total_price && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Or <span className="font-semibold text-emerald-600">${matchup.factory_rebate_price.toLocaleString()}</span> with factory instant rebate
              </p>
            )}
          </div>

          {/* Add to Cart */}
          {onAddToCart && (
            <Button
              onClick={() => onAddToCart(matchup)}
              className="w-full mt-3 gap-2"
              size="sm"
            >
              <ShoppingCart className="h-4 w-4" />
              Add to Cart
            </Button>
          )}
        </CardContent>
      </Card>

      {editable && (
        <FeaturesEditor matchup={matchup} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </>
  );
}
