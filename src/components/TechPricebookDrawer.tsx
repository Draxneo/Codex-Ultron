/**
 * TechPricebookDrawer — Full-screen mobile drawer with a 2-column grid
 * of tappable service items. Tap to add, badge shows quantity.
 */
import { useState, useMemo, useCallback } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useServicePricebook,
  useJobRepairItems,
  useAddRepairItem,
  useRemoveRepairItem,
  type PricebookItem,
  type JobRepairItem,
} from "@/hooks/useServicePricebook";
import { useHaptics } from "@/hooks/useHaptics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  techName?: string;
}

type DisplayRepairItem = JobRepairItem & { rowIds: string[] };

function repairItemKey(name: string, price: number) {
  return `${name.trim().toLowerCase()}|${Number(price || 0).toFixed(2)}`;
}

export function TechPricebookDrawer({ open, onOpenChange, jobId, techName }: Props) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [showCart, setShowCart] = useState(false);
  const { impact } = useHaptics();

  const { data: pricebook = [] } = useServicePricebook();
  const { data: repairItems = [] } = useJobRepairItems(jobId);
  const addItem = useAddRepairItem(jobId);
  const removeItem = useRemoveRepairItem(jobId);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(pricebook.map((i) => i.category)));
    return ["All", ...cats];
  }, [pricebook]);

  const filtered = useMemo(
    () => (activeCategory === "All" ? pricebook : pricebook.filter((i) => i.category === activeCategory)),
    [pricebook, activeCategory]
  );

  // Group repeated service repair rows so the tech sees one clean cart line.
  const groupedRepairItems = useMemo<DisplayRepairItem[]>(() => {
    const groups = new Map<string, DisplayRepairItem>();
    repairItems.forEach((ri) => {
      const key = repairItemKey(ri.name, ri.unit_price);
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += 1;
        existing.rowIds.push(ri.id);
        return;
      }
      groups.set(key, { ...ri, quantity: 1, rowIds: [ri.id] });
    });
    return Array.from(groups.values());
  }, [repairItems]);

  const qtyMap = useMemo(() => {
    const m: Record<string, { qty: number; itemId: string }> = {};
    groupedRepairItems.forEach((ri) => {
      m[repairItemKey(ri.name, ri.unit_price)] = { qty: ri.quantity, itemId: ri.rowIds[0] };
    });
    return m;
  }, [groupedRepairItems]);

  const totalItems = repairItems.reduce((s, r) => s + r.quantity, 0);
  const totalPrice = repairItems.reduce((s, r) => s + r.quantity * r.unit_price, 0);

  const handleTap = useCallback(
    (item: PricebookItem) => {
      impact("light");
      addItem.mutate({ pricebook_item_id: item.id, name: item.name, unit_price: item.base_price, added_by: techName });
    },
    [addItem, techName, impact]
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] flex flex-col">
        {/* Header */}
        <DrawerHeader className="flex flex-row items-center gap-2 pb-2 border-b">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <DrawerTitle className="flex-1 text-lg">Parts & Services</DrawerTitle>
          <Button
            variant={showCart ? "default" : "outline"}
            size="sm"
            className="relative"
            onClick={() => setShowCart(!showCart)}
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            {totalItems > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">
                {totalItems}
              </Badge>
            )}
            Cart
          </Button>
        </DrawerHeader>

        {showCart ? (
          /* ───── Cart View ───── */
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {repairItems.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No items added yet</p>
            )}
            {groupedRepairItems.map((ri) => (
              <div key={repairItemKey(ri.name, ri.unit_price)} className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ri.name}</p>
                  <p className="text-xs text-muted-foreground">${ri.unit_price.toFixed(0)} ea</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      impact("light");
                      const itemId = ri.rowIds[ri.rowIds.length - 1];
                      if (itemId) removeItem.mutate(itemId);
                    }}
                  >
                    {ri.quantity === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3" />}
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{ri.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      impact("light");
                      addItem.mutate({ name: ri.name, unit_price: ri.unit_price, added_by: techName });
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-sm font-semibold w-16 text-right">${(ri.quantity * ri.unit_price).toFixed(0)}</p>
              </div>
            ))}
          </div>
        ) : (
          /* ───── Pricebook Grid View ───── */
          <>
            {/* Category pills */}
            <div className="flex gap-2 px-3 py-2 overflow-x-auto no-scrollbar border-b">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "shrink-0 h-9 px-4 rounded-full text-sm font-medium transition-colors",
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* 2-column grid */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((item) => {
                  const inCart = qtyMap[repairItemKey(item.name, item.base_price)];
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTap(item)}
                      className={cn(
                        "relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-4 min-h-[120px] transition-all active:scale-95",
                        inCart
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/50"
                      )}
                    >
                      {inCart && (
                        <Badge className="absolute top-1.5 right-1.5 h-6 w-6 p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground">
                          {inCart.qty}
                        </Badge>
                      )}
                      <span className="text-3xl">{item.icon_emoji}</span>
                      <span className="text-sm font-medium text-center leading-tight">{item.name}</span>
                      <span className="text-base font-bold text-primary">${item.base_price.toFixed(0)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Sticky footer */}
        {totalItems > 0 && (
          <div className="border-t bg-background p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {totalItems} item{totalItems !== 1 ? "s" : ""} · <span className="text-primary font-bold">${totalPrice.toFixed(0)}</span>
              </span>
            </div>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
