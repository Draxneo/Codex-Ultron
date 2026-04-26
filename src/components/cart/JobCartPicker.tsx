import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ShoppingCart, X, Zap, Wrench, Package, Plus, Send } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { EquipmentCatalogBrowser } from "@/components/EquipmentCatalogBrowser";
import { RepairCatalogBrowser } from "@/components/RepairCatalogBrowser";
import { usePartsCatalog } from "@/hooks/usePartsCatalog";
import { useJobCart } from "@/hooks/useJobCart";
import { getJobCartPermissions } from "@/lib/jobCartStatus";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import type { RepairCatalogItem } from "@/components/RepairProductCard";

interface Props {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCart?: () => void;
  customerPhone?: string | null;
  customerName?: string | null;
}

const HOURLY_LABOR_RATE = 165; // fallback only when catalog has no base_price

export function JobCartPicker({ jobId, open, onOpenChange, onOpenCart }: Props) {
  const isMobile = useIsMobile();
  const { itemCount, cart, addItem } = useJobCart(jobId);
  const permissions = getJobCartPermissions(cart, itemCount);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customDesc, setCustomDesc] = useState("");

  const handleAddEquipment = (m: EquipmentMatchup) => {
    if (!permissions.canEditItems) return;
    addItem.mutate({
      kind: "equipment",
      source_id: m.id,
      name: `${m.brand} ${m.tier || ""} ${m.tonnage ? m.tonnage + "T" : ""} ${m.system_type || ""}`.replace(/\s+/g, " ").trim(),
      description: m.condenser_model + (m.furnace_model ? ` + ${m.furnace_model}` : "") + (m.coil_model ? ` + ${m.coil_model}` : ""),
      unit_price: m.total_price || 0,
      metadata: {
        ahri_number: m.ahri_number,
        seer2: m.seer2,
        tonnage: m.tonnage,
        condenser_model: m.condenser_model,
        furnace_model: m.furnace_model,
        coil_model: m.coil_model,
      },
    });
  };

  const handleAddRepair = (r: RepairCatalogItem) => {
    if (!permissions.canEditItems) return;
    // Prefer catalog base_price; fall back to labor math only if catalog has no price set
    const catalogPrice = Number(r.base_price ?? 0);
    const price = catalogPrice > 0
      ? catalogPrice
      : Math.round((r.default_labor_hours || 1) * HOURLY_LABOR_RATE);
    addItem.mutate({
      kind: "repair",
      source_id: r.id,
      name: r.name,
      description: r.customer_description,
      image_url: r.image_url || null,
      unit_price: price,
      metadata: {
        category: r.category,
        severity: r.default_severity,
        labor_hours: r.default_labor_hours,
        member_price: r.member_price ?? null,
        parts_cost: r.parts_cost ?? 0,
      },
    });
  };

  const handleAddCustom = () => {
    if (!permissions.canEditItems) return;
    const price = Number(customPrice);
    if (!customName.trim() || isNaN(price) || price <= 0) return;
    addItem.mutate({
      kind: "custom",
      name: customName.trim(),
      description: customDesc.trim() || null,
      unit_price: price,
    });
    setCustomName("");
    setCustomPrice("");
    setCustomDesc("");
  };

  const body = (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="equipment" className="flex-1 flex flex-col min-h-0">
        {!permissions.canEditItems && (
          <div className="mx-3 mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {permissions.lockedReason || "This cart cannot be edited."}
          </div>
        )}
        <TabsList className="w-full bg-muted/60 flex-wrap h-auto gap-1 p-1 mx-auto">
          <TabsTrigger value="equipment" className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Zap className="h-4 w-4" /> Equipment
          </TabsTrigger>
          <TabsTrigger value="repairs" className="flex-1 gap-1.5 data-[state=active]:bg-rose-500 data-[state=active]:text-white">
            <Wrench className="h-4 w-4" /> Repairs
          </TabsTrigger>
          <TabsTrigger value="parts" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white">
            <Package className="h-4 w-4" /> Parts
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex-1 gap-1.5 data-[state=active]:bg-violet-500 data-[state=active]:text-white">
            <Plus className="h-4 w-4" /> Custom
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-3 pt-3 pb-24">
          <TabsContent value="equipment" className="mt-0">
            <EquipmentCatalogBrowser onAddToCart={handleAddEquipment} compact={isMobile} />
          </TabsContent>
          <TabsContent value="repairs" className="mt-0">
            <RepairCatalogBrowser onAddToCart={handleAddRepair} compact={isMobile} />
          </TabsContent>
          <TabsContent value="parts" className="mt-0">
            <PartsPickerGrid disabled={!permissions.canEditItems} onAdd={(p) => addItem.mutate({
              kind: "part",
              source_id: p.id,
              name: p.name,
              description: p.description,
              unit_price: p.unit_price,
            })} />
          </TabsContent>
          <TabsContent value="custom" className="mt-0">
            <Card className="p-4 space-y-3 max-w-md mx-auto">
              <div>
                <Label htmlFor="custom-name">Item Name</Label>
                <Input id="custom-name" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Diagnostic Fee" />
              </div>
              <div>
                <Label htmlFor="custom-desc">Description (optional)</Label>
                <Input id="custom-desc" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="What's this for?" />
              </div>
              <div>
                <Label htmlFor="custom-price">Price ($)</Label>
                <Input id="custom-price" type="number" inputMode="decimal" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="0.00" />
              </div>
              <Button onClick={handleAddCustom} className="w-full" disabled={!permissions.canEditItems || !customName.trim() || !customPrice}>
                <Plus className="h-4 w-4 mr-1" /> Add to Cart
              </Button>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* Sticky bottom strip */}
      <div className="absolute inset-x-0 bottom-0 bg-background border-t shadow-lg p-3 flex items-center gap-3 z-10">
        <div className="flex items-center gap-2 flex-1">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold text-sm">{itemCount} item{itemCount !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground">${(cart?.total || 0).toFixed(2)}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onOpenCart?.(); }}>
          Review
        </Button>
        <Button size="sm" onClick={() => { onOpenChange(false); onOpenCart?.(); }} disabled={itemCount === 0}>
          <Send className="h-4 w-4 mr-1" /> Send
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Add to Cart</span>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </DrawerTitle>
          </DrawerHeader>
          <div className="relative flex-1 min-h-0">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Add to Cart</SheetTitle>
        </SheetHeader>
        <div className="relative flex-1 min-h-0">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

function PartsPickerGrid({ onAdd, disabled = false }: { onAdd: (p: { id: string; name: string; description: string | null; unit_price: number }) => void; disabled?: boolean }) {
  const { parts, isLoading } = usePartsCatalog();
  const [q, setQ] = useState("");

  if (isLoading) return <p className="text-center text-muted-foreground py-12 text-sm">Loading parts...</p>;

  const filtered = parts.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  if (parts.length === 0) {
    return <p className="text-center text-muted-foreground py-12 text-sm">No parts in catalog yet. Use Custom tab.</p>;
  }

  return (
    <div className="space-y-3">
      <Input placeholder="Search parts..." value={q} onChange={(e) => setQ(e.target.value)} className="h-9 text-sm" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p) => {
          const firstNum = p.supply_house_numbers[0];
          const cost = firstNum?.unit_cost || 0;
          return (
            <Card key={p.id} className="p-3 flex flex-col gap-2">
              <div>
                <p className="font-semibold text-sm leading-tight">{p.name}</p>
                {p.category && <p className="text-xs text-muted-foreground">{p.category}</p>}
              </div>
              {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
              <div className="flex items-center justify-between mt-auto pt-2">
                <span className="font-bold text-sm">${cost.toFixed(2)}</span>
                <Button size="sm" onClick={() => onAdd({ id: p.id, name: p.name, description: p.description, unit_price: cost })} disabled={disabled}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
