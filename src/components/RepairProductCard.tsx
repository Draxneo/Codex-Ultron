import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Pencil, Wrench, Clock, AlertTriangle, Info, ShieldAlert, Trash2, Check, X, DollarSign, Sparkles, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CatalogImageUpload } from "@/components/CatalogImageUpload";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRepairPricingFormulas } from "@/hooks/useRepairPricingFormulas";

const SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: typeof AlertTriangle; label: string }> = {
  necessary: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300", icon: ShieldAlert, label: "🔴 Necessary" },
  recommended: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", icon: AlertTriangle, label: "🟡 Recommended" },
  deluxe: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", icon: Info, label: "🔵 Upgrade" },
};

const CATEGORY_COLORS: Record<string, string> = {
  Electrical: "bg-yellow-600 text-white",
  Refrigerant: "bg-cyan-600 text-white",
  Airflow: "bg-sky-600 text-white",
  Motors: "bg-orange-600 text-white",
  Controls: "bg-violet-600 text-white",
  Safety: "bg-red-600 text-white",
  Drainage: "bg-teal-600 text-white",
  Upgrades: "bg-emerald-600 text-white",
  General: "bg-slate-600 text-white",
};

export interface RepairCatalogItem {
  id: string;
  name: string;
  category: string;
  tech_description: string;
  customer_description: string;
  importance: string;
  consequences: string;
  default_severity: string;
  default_labor_hours: number;
  keywords: string[];
  is_active: boolean;
  image_url?: string | null;
  base_price?: number;
  parts_cost?: number;
  member_price?: number | null;
  flat_rate?: boolean;
  manual_price_override?: boolean | null;
}

interface Props {
  item: RepairCatalogItem;
  onAddToCart?: (item: RepairCatalogItem) => void;
  onEdit?: (item: RepairCatalogItem) => void;
  editable?: boolean;
  compact?: boolean;
}

export function RepairProductCard({ item, onAddToCart, onEdit, editable, compact }: Props) {
  const severity = SEVERITY_STYLES[item.default_severity] || SEVERITY_STYLES.recommended;
  const catColor = CATEGORY_COLORS[item.category] || "bg-primary text-primary-foreground";
  const queryClient = useQueryClient();
  const { confirmDelete } = useConfirm();
  const { getFormula } = useRepairPricingFormulas();
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState(String(item.base_price ?? 0));
  const [editingField, setEditingField] = useState<null | "customer_description" | "importance" | "consequences">(null);
  const [textDraft, setTextDraft] = useState("");

  const startEditField = (field: "customer_description" | "importance" | "consequences") => {
    setTextDraft((item[field] as string) || "");
    setEditingField(field);
  };

  const saveTextField = async () => {
    if (!editingField) return;
    const value = textDraft.trim();
    await supabase
      .from("repair_catalog")
      .update({ [editingField]: value } as any)
      .eq("id", item.id);
    queryClient.invalidateQueries({ queryKey: ["repair-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["repair_catalog_for_pricing"] });
    toast({ title: "Saved", description: `${item.name} updated.` });
    setEditingField(null);
  };

  const basePrice = Number(item.base_price ?? 0);
  const memberPrice = item.member_price != null ? Number(item.member_price) : null;
  const partsCost = Number(item.parts_cost ?? 0);
  const marginFraction = basePrice > 0 ? (basePrice - partsCost) / basePrice : 0;
  const margin = Math.round(marginFraction * 100);
  const floor = getFormula(item.category).margin_floor;
  const belowFloor = basePrice > 0 && marginFraction < floor;
  const isOverride = !!item.manual_price_override;

  const handleImageChange = async (url: string | null) => {
    await supabase.from("repair_catalog").update({ image_url: url } as any).eq("id", item.id);
    queryClient.invalidateQueries({ queryKey: ["repair-catalog"] });
  };

  const savePrice = async () => {
    const newPrice = parseFloat(priceDraft);
    if (isNaN(newPrice) || newPrice < 0) {
      toast({ title: "Invalid price", variant: "destructive" });
      return;
    }
    const memberDiscount = getFormula(item.category).member_discount;
    const newMember = Math.round(newPrice * (1 - memberDiscount) * 100) / 100;
    await supabase
      .from("repair_catalog")
      .update({ base_price: newPrice, member_price: newMember, manual_price_override: true } as any)
      .eq("id", item.id);
    queryClient.invalidateQueries({ queryKey: ["repair-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["repair_catalog_for_pricing"] });
    setEditingPrice(false);
    toast({ title: "Price locked (manual override)", description: `${item.name}: $${newPrice.toFixed(2)}` });
  };

  const revertOverride = async () => {
    await supabase
      .from("repair_catalog")
      .update({ manual_price_override: false } as any)
      .eq("id", item.id);
    queryClient.invalidateQueries({ queryKey: ["repair-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["repair_catalog_for_pricing"] });
    toast({ title: "Reverted to formula", description: `${item.name} will follow the pricing matrix again.` });
  };

  return (
    <Card className={`overflow-hidden hover:shadow-lg transition-shadow border-border/60 flex flex-col h-full group relative ${!item.is_active ? "opacity-50" : ""}`}>
      {/* Edit + Delete buttons */}
      {editable && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm"
              onClick={() => onEdit(item)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background/80 backdrop-blur-sm text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={async () => {
              await confirmDelete(item.name, {
                description: "This will deactivate the repair (it can be restored later).",
                confirmText: "Remove Repair",
                onConfirm: async () => {
                  await supabase.from("repair_catalog").update({ is_active: false } as any).eq("id", item.id);
                  queryClient.invalidateQueries({ queryKey: ["repair-catalog"] });
                  toast({ title: "Repair removed", description: `${item.name} has been deactivated.` });
                },
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Image area */}
      {editable ? (
        <div className="px-4 pt-4">
          <CatalogImageUpload
            currentUrl={item.image_url || null}
            bucket="manufacturer-brochures"
            folder="repair-catalog"
            onUploaded={handleImageChange}
            size="md"
          />
        </div>
      ) : item.image_url ? (
        <div className="h-32 w-full overflow-hidden">
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-24 w-full bg-muted/30 flex items-center justify-center">
          <Wrench className="h-8 w-8 text-muted-foreground/20" />
        </div>
      )}

      {/* Header: Category + Severity */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <Badge className={`${catColor} text-xs font-bold px-2.5 py-0.5 rounded-md`}>
          {item.category}
        </Badge>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${severity.bg} ${severity.text}`}>
          {severity.label}
        </span>
      </div>

      <CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col">
        {/* Name */}
        <h3 className="font-semibold text-sm mb-2">{item.name}</h3>

        {/* Customer description */}
        {editable && editingField === "customer_description" ? (
          <div className="mb-3 space-y-1.5">
            <Textarea
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              autoFocus
              rows={4}
              className="text-xs"
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingField(null);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveTextField();
              }}
            />
            <div className="flex gap-1.5 justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingField(null)}>
                <X className="h-3 w-3 mr-1" />Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={saveTextField}>
                <Check className="h-3 w-3 mr-1" />Save
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">⌘/Ctrl+Enter to save · Esc to cancel</p>
          </div>
        ) : (
          <p
            className={`text-xs text-muted-foreground mb-3 ${compact ? "line-clamp-2" : editable ? "" : "line-clamp-3"} ${editable ? "cursor-text rounded hover:bg-muted/40 -mx-1 px-1 transition-colors" : ""}`}
            onClick={editable ? () => startEditField("customer_description") : undefined}
            title={editable ? "Click to edit" : undefined}
          >
            {item.customer_description || (editable ? <span className="italic opacity-60">Click to add customer description…</span> : null)}
          </p>
        )}

        {/* Why it matters / consequences */}
        {!compact && (
          <div className="space-y-1.5 mb-3 flex-1">
            {(item.importance || editable) && (
              editable && editingField === "importance" ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    autoFocus
                    rows={3}
                    className="text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingField(null);
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveTextField();
                    }}
                  />
                  <div className="flex gap-1.5 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingField(null)}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={saveTextField}>Save</Button>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex items-start gap-1.5 text-xs ${editable ? "cursor-text rounded hover:bg-muted/40 -mx-1 px-1 transition-colors" : ""}`}
                  onClick={editable ? () => startEditField("importance") : undefined}
                  title={editable ? "Click to edit" : undefined}
                >
                  <Info className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                  <span className={`text-muted-foreground ${editable ? "" : "line-clamp-2"}`}>
                    {item.importance || (editable ? <span className="italic opacity-60">Click to add why it matters…</span> : null)}
                  </span>
                </div>
              )
            )}
            {(item.consequences || editable) && (
              editable && editingField === "consequences" ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    autoFocus
                    rows={3}
                    className="text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingField(null);
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveTextField();
                    }}
                  />
                  <div className="flex gap-1.5 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingField(null)}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={saveTextField}>Save</Button>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex items-start gap-1.5 text-xs ${editable ? "cursor-text rounded hover:bg-muted/40 -mx-1 px-1 transition-colors" : ""}`}
                  onClick={editable ? () => startEditField("consequences") : undefined}
                  title={editable ? "Click to edit" : undefined}
                >
                  <AlertTriangle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                  <span className={`text-muted-foreground ${editable ? "" : "line-clamp-2"}`}>
                    {item.consequences || (editable ? <span className="italic opacity-60">Click to add consequences…</span> : null)}
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {/* Price block */}
        <div className="mb-3 rounded-md border border-border/60 bg-muted/30 p-2.5">
          {editingPrice ? (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                step="1"
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") savePrice();
                  if (e.key === "Escape") { setEditingPrice(false); setPriceDraft(String(basePrice)); }
                }}
                autoFocus
                className="h-7 text-sm font-bold"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={savePrice}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingPrice(false); setPriceDraft(String(basePrice)); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xl font-extrabold tracking-tight text-foreground tabular-nums">
                  ${basePrice.toFixed(0)}
                </span>
                {memberPrice != null && memberPrice < basePrice && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    <Sparkles className="h-2.5 w-2.5" />
                    Club ${memberPrice.toFixed(0)}
                  </span>
                )}
                {belowFloor && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded" title={`Margin ${margin}% below floor ${Math.round(floor * 100)}%`}>
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Low margin
                  </span>
                )}
                {isOverride && editable && (
                  <button
                    onClick={revertOverride}
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded hover:bg-violet-500/20 transition-colors"
                    title="Click to revert to formula pricing"
                  >
                    <Lock className="h-2.5 w-2.5" />
                    Manual
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-medium gap-0.5 px-1.5 py-0">
                  <Clock className="h-2.5 w-2.5" />
                  {item.default_labor_hours}h
                </Badge>
                {editable && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingPrice(true)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}
          {editable && !editingPrice && partsCost > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
              <span>Parts ${partsCost.toFixed(0)}</span>
              <span>•</span>
              <span className={margin >= 50 ? "text-emerald-600" : margin >= 30 ? "text-amber-600" : "text-rose-600"}>
                {margin}% margin
              </span>
            </div>
          )}
        </div>

        {item.keywords.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-3">
            {item.keywords.slice(0, compact ? 3 : 5).map(k => (
              <span key={k} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{k}</span>
            ))}
            {item.keywords.length > (compact ? 3 : 5) && (
              <span className="text-[10px] text-muted-foreground">+{item.keywords.length - (compact ? 3 : 5)}</span>
            )}
          </div>
        )}

        {/* Add to Cart */}
        {onAddToCart && (
          <Button
            onClick={() => onAddToCart(item)}
            className="w-full mt-auto gap-2"
            size="sm"
          >
            <ShoppingCart className="h-4 w-4" />
            Add ${basePrice.toFixed(0)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
