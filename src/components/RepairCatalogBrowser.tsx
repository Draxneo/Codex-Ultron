import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, LayoutGrid, List, Loader2 } from "lucide-react";
import { RepairProductCard, type RepairCatalogItem } from "@/components/RepairProductCard";
import { RepairPricingMatrix } from "@/components/catalog/RepairPricingMatrix";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const CATEGORIES = ["Electrical", "Refrigerant", "Airflow", "Motors", "Controls", "Safety", "Drainage", "Upgrades", "General"];

const SORT_OPTIONS = [
  { value: "name_asc", label: "Name: A → Z" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
  { value: "severity", label: "Severity" },
  { value: "labor_desc", label: "Labor: High → Low" },
  { value: "category", label: "Category" },
] as const;

interface Props {
  onAddToCart?: (item: RepairCatalogItem) => void;
  onEdit?: (item: RepairCatalogItem) => void;
  editable?: boolean;
  compact?: boolean;
  maxHeight?: string;
}

export function RepairCatalogBrowser({ onAddToCart, onEdit, editable, compact, maxHeight }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [sortBy, setSortBy] = useState("category");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["repair-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_catalog")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as RepairCatalogItem[];
    },
  });

  const filtered = useMemo(() => {
    let result = items.filter(i => i.is_active);

    const effectiveCategory = category === "all_categories" ? "" : category;
    const effectiveSeverity = severity === "all_severity" ? "" : severity;

    if (effectiveCategory) result = result.filter(i => i.category === effectiveCategory);
    if (effectiveSeverity) result = result.filter(i => i.default_severity === effectiveSeverity);
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.customer_description.toLowerCase().includes(q) ||
        i.keywords.some(k => k.toLowerCase().includes(q))
      );
    }

    switch (sortBy) {
      case "name_asc":
        return result.sort((a, b) => a.name.localeCompare(b.name));
      case "price_asc":
        return result.sort((a, b) => Number(a.base_price ?? 0) - Number(b.base_price ?? 0));
      case "price_desc":
        return result.sort((a, b) => Number(b.base_price ?? 0) - Number(a.base_price ?? 0));
      case "severity": {
        const order = { necessary: 0, recommended: 1, deluxe: 2 };
        return result.sort((a, b) => (order[a.default_severity as keyof typeof order] ?? 1) - (order[b.default_severity as keyof typeof order] ?? 1));
      }
      case "labor_desc":
        return result.sort((a, b) => b.default_labor_hours - a.default_labor_hours);
      case "category":
      default:
        return result.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    }
  }, [items, query, category, severity, sortBy]);

  return (
    <div className="space-y-3">
      {/* Pricing Matrix (admin only) */}
      {editable && <RepairPricingMatrix />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search repairs..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_categories">All Categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue placeholder="All Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_severity">All Severity</SelectItem>
            <SelectItem value="necessary">🔴 Necessary</SelectItem>
            <SelectItem value="recommended">🟡 Recommended</SelectItem>
            <SelectItem value="deluxe">🔵 Upgrade</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!compact && (
          <ToggleGroup type="single" value={viewMode} onValueChange={v => v && setViewMode(v as "grid" | "list")}>
            <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 w-9 p-0">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="h-9 w-9 p-0">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {/* Results */}
      <div className={`overflow-y-auto ${maxHeight || "max-h-[70vh]"}`}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading repairs...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No repairs found. Try adjusting filters.</p>
          </div>
        ) : (
          <div className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
              : "space-y-2"
          }>
            {filtered.map(item => (
              <RepairProductCard
                key={item.id}
                item={item}
                onAddToCart={onAddToCart}
                onEdit={onEdit}
                editable={editable}
                compact={compact || viewMode === "list"}
              />
            ))}
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} repair{filtered.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
