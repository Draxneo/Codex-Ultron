import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, LayoutGrid, List, Loader2, Table as TableIcon, X } from "lucide-react";
import { EquipmentProductCard } from "@/components/EquipmentProductCard";
import { EquipmentMatchupsTable } from "@/components/EquipmentMatchupsTable";
import { PricingFormulaMatrix } from "@/components/catalog/PricingFormulaMatrix";
import { useEquipmentSearch } from "@/hooks/useEquipmentSearch";
import { EquipmentImageExtractor } from "@/components/catalog/EquipmentImageExtractor";
import { BRANDS, SYSTEM_TYPES, TIERS, APPLICATIONS } from "@/hooks/useEquipmentMatchups";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  gas_heat: "Gas Heat",
  heat_pump: "Heat Pump",
  electric: "Straight Cool",
  dual_fuel: "Dual Fuel",
};

const SORT_OPTIONS = [
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
  { value: "seer2_desc", label: "SEER2: High → Low" },
  { value: "tonnage_asc", label: "Tonnage: Small → Large" },
] as const;

interface Props {
  onAddToCart?: (matchup: EquipmentMatchup) => void;
  compact?: boolean;
  initialBrand?: string;
  maxHeight?: string;
  editable?: boolean;
}

type ViewMode = "grid" | "list" | "table";

export function EquipmentCatalogBrowser({ onAddToCart, compact, initialBrand, maxHeight, editable }: Props) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState(initialBrand || "");
  const [systemType, setSystemType] = useState("");
  const [tier, setTier] = useState("");
  const [application, setApplication] = useState("");
  const [sortBy, setSortBy] = useState("price_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const effectiveBrand = brand === "all_brands" ? "" : brand;
  const effectiveSystemType = systemType === "all_types" ? "" : systemType;
  const effectiveTier = tier === "all_tiers" ? "" : tier;
  const effectiveApplication = application === "all_apps" ? "" : application;

  const { results, loading, error } = useEquipmentSearch(query, {
    brand: effectiveBrand || undefined,
    systemType: effectiveSystemType || undefined,
    tier: effectiveTier || undefined,
    application: effectiveApplication || undefined,
  });

  const sorted = useMemo(() => {
    const items = [...results];
    switch (sortBy) {
      case "price_asc":
        return items.sort((a, b) => (a.total_price || 0) - (b.total_price || 0));
      case "price_desc":
        return items.sort((a, b) => (b.total_price || 0) - (a.total_price || 0));
      case "seer2_desc":
        return items.sort((a, b) => (b.seer2 || 0) - (a.seer2 || 0));
      case "tonnage_asc":
        return items.sort((a, b) => (a.tonnage || 0) - (b.tonnage || 0));
      default:
        return items;
    }
  }, [results, sortBy]);

  const hasAnyFilter = !!query || !!effectiveBrand || !!effectiveSystemType || !!effectiveTier || !!effectiveApplication;

  const resetFilters = () => {
    setQuery("");
    setBrand("");
    setSystemType("");
    setTier("");
    setApplication("");
  };

  return (
    <div className="space-y-3">
      {/* Image-to-matchups extractor + Pricing matrix — admin/edit mode only */}
      {editable && <EquipmentImageExtractor />}
      {editable && <PricingFormulaMatrix />}

      {/* Filters bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search models, AHRI, tier..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={brand} onValueChange={setBrand}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="All Brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_brands">All Brands</SelectItem>
            {BRANDS.map(b => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={systemType} onValueChange={setSystemType}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_types">All Types</SelectItem>
            {SYSTEM_TYPES.map(st => (
              <SelectItem key={st} value={st}>{SYSTEM_TYPE_LABELS[st] || st}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="w-[120px] h-9 text-xs">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_tiers">All Tiers</SelectItem>
            {TIERS.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={application} onValueChange={setApplication}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue placeholder="All Orientations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_apps">All Orientations</SelectItem>
            {APPLICATIONS.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1 text-xs">
            <X className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}
        {!compact && (
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)}>
            <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 w-9 p-0">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="h-9 w-9 p-0">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view" className="h-9 w-9 p-0">
              <TableIcon className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {/* Results */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {viewMode === "table" && !compact ? (
        loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading catalog...</span>
          </div>
        ) : (
          <EquipmentMatchupsTable rows={sorted} editable={editable} />
        )
      ) : (
        <>
          <div className={`overflow-y-auto ${maxHeight || "max-h-[70vh]"}`}>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading catalog...</span>
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No equipment found. Try selecting a brand or adjusting filters.</p>
              </div>
            ) : (
              <div className={
                viewMode === "grid"
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                  : "space-y-2"
              }>
                {sorted.map(matchup => (
                  <EquipmentProductCard
                    key={matchup.id}
                    matchup={matchup}
                    onAddToCart={onAddToCart}
                    compact={compact || viewMode === "list"}
                    editable={editable}
                  />
                ))}
              </div>
            )}
          </div>

          {sorted.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Showing {sorted.length} matchup{sorted.length !== 1 ? "s" : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}
