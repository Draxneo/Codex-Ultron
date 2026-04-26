import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEquipmentSearch } from "@/hooks/useEquipmentSearch";
import { BRANDS } from "@/hooks/useEquipmentMatchups";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import { X, Plus, Search, Send, Trash2, Wrench, Home, ShieldPlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EquipmentCatalogBrowser } from "@/components/EquipmentCatalogBrowser";
import { useQuery } from "@tanstack/react-query";

interface CartItem {
  id: string;
  label: string;
  description: string;
  price: number;
  equipment_id?: string;
  seer2?: number | null;
  brand?: string;
  tonnage?: number | null;
  monthly_payment?: number | null;
  features_benefits?: { icon: string; text: string }[] | null;
}

interface TierData {
  items: CartItem[];
}

type CartType = "repair" | "new_system" | null;

const REPAIR_TIERS = [
  { key: "critical", label: "Critical Repair", emoji: "🔴", desc: "Must fix today", color: "bg-red-500/10 border-red-500/30 text-red-700" },
  { key: "recommended", label: "Recommended Repair", emoji: "🟡", desc: "Should fix this season", color: "bg-yellow-500/10 border-yellow-500/30 text-yellow-700" },
  { key: "reconditioning", label: "Reconditioning", emoji: "🟢", desc: "Extends life and efficiency", color: "bg-green-500/10 border-green-500/30 text-green-700" },
] as const;

const SYSTEM_TIERS = [
  { key: "good", label: "Good", emoji: "⭐" },
  { key: "better", label: "Better", emoji: "⭐⭐" },
  { key: "best", label: "Best", emoji: "⭐⭐⭐" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  estimateId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  techName?: string;
}

export function TechEstimateCartDrawer({ open, onOpenChange, jobId, estimateId, customerId, customerName, customerPhone, techName }: Props) {
  const { toast } = useToast();
  const [cartType, setCartType] = useState<CartType>(null);
  const [repairTiers, setRepairTiers] = useState<Record<string, TierData>>({
    critical: { items: [] },
    recommended: { items: [] },
    reconditioning: { items: [] },
  });
  const [systemSlots, setSystemSlots] = useState<Record<string, CartItem | null>>({
    good: null,
    better: null,
    best: null,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBrand, setSearchBrand] = useState<string>("");
  const [activeTier, setActiveTier] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  const { data: addons = [] } = useQuery({
    queryKey: ["addons_active"],
    queryFn: async () => {
      const { data } = await supabase.from("addons").select("*").eq("active", true).order("sort_order");
      return data || [];
    },
  });

  const { results: searchResults, loading: searchLoading } = useEquipmentSearch(searchQuery, { brand: searchBrand || undefined });

  const resetCart = () => {
    setCartType(null);
    setRepairTiers({ critical: { items: [] }, recommended: { items: [] }, reconditioning: { items: [] } });
    setSystemSlots({ good: null, better: null, best: null });
    setSearchQuery("");
    setActiveTier(null);
    setSelectedAddons([]);
  };

  const addRepairItem = (tier: string, item: CartItem) => {
    setRepairTiers(prev => ({
      ...prev,
      [tier]: { items: [...prev[tier].items, item] },
    }));
    setSearchQuery("");
    setActiveTier(null);
  };

  const removeRepairItem = (tier: string, idx: number) => {
    setRepairTiers(prev => ({
      ...prev,
      [tier]: { items: prev[tier].items.filter((_, i) => i !== idx) },
    }));
  };

  const addCustomItem = (tier: string) => {
    if (!customLabel || !customPrice) return;
    addRepairItem(tier, {
      id: `custom_${Date.now()}`,
      label: customLabel,
      description: "Custom line item",
      price: parseFloat(customPrice),
    });
    setCustomLabel("");
    setCustomPrice("");
  };

  const setSystemSlot = (slot: string, equip: any) => {
    setSystemSlots(prev => ({
      ...prev,
      [slot]: {
        id: equip.id,
        label: `${equip.brand} ${equip.condenser_model}`,
        description: [equip.furnace_model, equip.coil_model].filter(Boolean).join(" + "),
        price: equip.total_price || 0,
        equipment_id: equip.id,
        seer2: equip.seer2,
        brand: equip.brand,
        tonnage: equip.tonnage,
        monthly_payment: equip.monthly_payment,
        features_benefits: equip.features_benefits || null,
      },
    }));
    setSearchQuery("");
    setActiveTier(null);
  };

  const getTierTotal = (tier: string) => repairTiers[tier]?.items.reduce((s, i) => s + i.price, 0) || 0;

  const hasItems = cartType === "repair"
    ? Object.values(repairTiers).some(t => t.items.length > 0)
    : Object.values(systemSlots).some(s => s !== null);

  const handleSend = async () => {
    if (!hasItems) return;
    setSending(true);
    try {
      // Build pricing snapshot
      let pricingSnapshot: any;
      let selectedTiers: string[] = [];

      if (cartType === "repair") {
        const tiers: Record<string, any[]> = {};
        for (const [key, data] of Object.entries(repairTiers)) {
          if (data.items.length > 0) {
            tiers[key] = data.items.map(i => ({ item: i.label, price: i.price, equipment_id: i.equipment_id }));
            selectedTiers.push(key);
          }
        }
        pricingSnapshot = { cart_type: "repair", repair_tiers: tiers };
      } else {
        const options: Record<string, any> = {};
        for (const [key, item] of Object.entries(systemSlots)) {
          if (item) {
            options[key] = {
              label: item.label,
              description: item.description,
              price: item.price,
              equipment_id: item.equipment_id,
              seer2: item.seer2,
              brand: item.brand,
              tonnage: item.tonnage,
              monthly_payment: item.monthly_payment,
              features_benefits: item.features_benefits || [],
            };
            selectedTiers.push(key);
          }
        }
        pricingSnapshot = { cart_type: "new_system", system_options: options };
      }

      // Add selected addons to snapshot
      if (selectedAddons.length > 0) {
        const addonData = addons
          .filter((a: any) => selectedAddons.includes(a.id))
          .map((a: any) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            price: a.promo_active ? Math.round(a.cost * (1 - a.promo_percent / 100) * 100) / 100 : a.cost,
            original_price: a.promo_active ? a.cost : undefined,
          }));
        pricingSnapshot.addons = addonData;
      }

      // Insert into estimate_presentations
      const { data: pres, error } = await supabase
        .from("estimate_presentations" as any)
        .insert({
          estimate_id: estimateId || jobId,
          pricing_snapshot: pricingSnapshot,
          selected_tiers: selectedTiers,
          cart_source: "tech_onsite",
          customer_phone: customerPhone || null,
          status: "pending",
        } as any)
        .select("token")
        .single();

      if (error) throw error;

      const presData = pres as any;
      const link = `${window.location.origin}/presentation/${presData.token}`;

      // Send SMS to customer
      if (customerPhone) {
        const firstName = customerName?.split(" ")[0] || "there";
        const body = `Hi ${firstName} — ${techName || "Your technician"} has prepared your options for today's visit.\n\nTap here to review and choose: ${link}`;

        const { sendSmsImpl } = await import("@/hooks/useSendSms");
        await sendSmsImpl({
          to: customerPhone, body, jobId,
          contactName: customerName || null, contactType: "customer",
          source: "tech_estimate_cart", hitlApproved: true, silent: true,
        });
      }

      toast({ title: `Sent to ${customerName || "customer"}`, description: customerPhone ? `at ${customerPhone}` : "Link created" });
      resetCart();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error sending estimate", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[95vh] max-h-[95vh] overflow-hidden flex flex-col">
        <DrawerHeader className="flex items-center justify-between border-b pb-3 shrink-0">
          <DrawerTitle className="text-lg">
            {!cartType ? "Build Estimate" : cartType === "repair" ? "🔧 Repair Options" : "🏠 New System"}
          </DrawerTitle>
          {cartType && (
            <Button variant="ghost" size="sm" onClick={resetCart}>
              <X className="h-4 w-4 mr-1" /> Start Over
            </Button>
          )}
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Step 1: Type Selection */}
          {!cartType && (
            <div className="grid grid-cols-2 gap-4 pt-8">
              <button
                onClick={() => setCartType("repair")}
                className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Wrench className="h-12 w-12 text-orange-500" />
                <span className="text-lg font-semibold">Repair Options</span>
                <span className="text-sm text-muted-foreground">3 tiers: Critical, Recommended, Reconditioning</span>
              </button>
              <button
                onClick={() => setCartType("new_system")}
                className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Home className="h-12 w-12 text-blue-500" />
                <span className="text-lg font-semibold">New System</span>
                <span className="text-sm text-muted-foreground">Good / Better / Best options</span>
              </button>
            </div>
          )}

          {/* Repair Cart Builder */}
          {cartType === "repair" && (
            <div className="space-y-4">
              {REPAIR_TIERS.map(tier => (
                <Card key={tier.key} className={`border ${tier.color}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{tier.emoji}</span>
                        <div>
                          <h3 className="font-semibold">{tier.label}</h3>
                          <p className="text-xs text-muted-foreground">{tier.desc}</p>
                        </div>
                      </div>
                      {getTierTotal(tier.key) > 0 && (
                        <Badge variant="secondary" className="text-base font-bold">
                          ${getTierTotal(tier.key).toLocaleString()}
                        </Badge>
                      )}
                    </div>

                    {/* Listed items */}
                    {repairTiers[tier.key].items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-background/60 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">${item.price.toLocaleString()}</span>
                          <button onClick={() => removeRepairItem(tier.key, idx)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add items */}
                    {activeTier === tier.key ? (
                      <div className="space-y-2 border-t pt-2">
                        <div className="flex gap-2">
                          <Select value={searchBrand} onValueChange={setSearchBrand}>
                            <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Brand" /></SelectTrigger>
                            <SelectContent>{BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                          </Select>
                          <div className="relative flex-1">
                            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search equipment..."
                              value={searchQuery}
                              onChange={e => setSearchQuery(e.target.value)}
                              className="pl-8 h-9 text-sm"
                            />
                          </div>
                        </div>

                        {searchResults.length > 0 && (
                          <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                            {searchResults.map(eq => (
                              <button
                                key={eq.id}
                                className="w-full text-left px-3 py-2 hover:bg-accent/50 text-sm"
                                onClick={() => addRepairItem(tier.key, {
                                  id: eq.id,
                                  label: eq.condenser_model,
                                  description: `${eq.brand} ${eq.tonnage || ""}T`,
                                  price: eq.total_price || 0,
                                  equipment_id: eq.id,
                                })}
                              >
                                <span className="font-medium">{eq.condenser_model}</span>
                                <span className="text-muted-foreground ml-2">{eq.brand} {eq.tonnage}T — ${(eq.total_price || 0).toLocaleString()}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Custom item */}
                        <div className="flex gap-2 items-end">
                          <Input placeholder="Custom item" value={customLabel} onChange={e => setCustomLabel(e.target.value)} className="h-9 text-sm flex-1" />
                          <Input placeholder="$" type="number" value={customPrice} onChange={e => setCustomPrice(e.target.value)} className="h-9 text-sm w-24" />
                          <Button size="sm" variant="secondary" onClick={() => addCustomItem(tier.key)} disabled={!customLabel || !customPrice}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>

                        <Button size="sm" variant="ghost" onClick={() => setActiveTier(null)} className="w-full text-xs">Done</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => { setActiveTier(tier.key); setSearchQuery(""); setSearchBrand(""); }} className="w-full">
                        <Plus className="h-4 w-4 mr-1" /> Add Item
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* New System Cart Builder */}
          {cartType === "new_system" && (
            <div className="space-y-4">
              {SYSTEM_TIERS.map(tier => (
                <Card key={tier.key} className="border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span>{tier.emoji}</span>
                      <h3 className="font-semibold text-lg">{tier.label}</h3>
                    </div>

                    {systemSlots[tier.key] ? (
                      <div className="bg-accent/30 rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">{systemSlots[tier.key]!.label}</p>
                            <p className="text-sm text-muted-foreground">{systemSlots[tier.key]!.description}</p>
                            {systemSlots[tier.key]!.seer2 && <Badge variant="outline" className="mt-1">{systemSlots[tier.key]!.seer2} SEER2</Badge>}
                          </div>
                          <button onClick={() => setSystemSlots(prev => ({ ...prev, [tier.key]: null }))} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {systemSlots[tier.key]!.features_benefits && systemSlots[tier.key]!.features_benefits!.length > 0 && (
                          <div className="space-y-1 border-t border-border/50 pt-2">
                            {systemSlots[tier.key]!.features_benefits!.map((f, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="text-primary">✓</span>
                                <span>{f.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-right">
                          <p className="text-xl font-bold">${systemSlots[tier.key]!.price.toLocaleString()}</p>
                          {systemSlots[tier.key]!.monthly_payment && (
                            <p className="text-sm text-muted-foreground">${systemSlots[tier.key]!.monthly_payment}/mo</p>
                          )}
                        </div>
                      </div>
                    ) : activeTier === tier.key ? (
                      <div className="space-y-2 border-t pt-2">
                        <EquipmentCatalogBrowser
                          compact
                          maxHeight="max-h-[50vh]"
                          onAddToCart={(eq: EquipmentMatchup) => { setSystemSlot(tier.key, eq); setActiveTier(null); }}
                        />
                        <Button size="sm" variant="ghost" onClick={() => setActiveTier(null)} className="w-full text-xs">Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => { setActiveTier(tier.key); setSearchQuery(""); setSearchBrand(""); }} className="w-full">
                        <Search className="h-4 w-4 mr-1" /> Select System
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Addons Section */}
          {cartType && addons.length > 0 && (
            <Card className="border border-dashed">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldPlus className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Add-Ons</h3>
                </div>
                <div className="space-y-2">
                  {addons.map((addon: any) => {
                    const isChecked = selectedAddons.includes(addon.id);
                    const effectivePrice = addon.promo_active
                      ? Math.round(addon.cost * (1 - addon.promo_percent / 100) * 100) / 100
                      : addon.cost;
                    return (
                      <label
                        key={addon.id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() =>
                            setSelectedAddons(prev =>
                              prev.includes(addon.id)
                                ? prev.filter(id => id !== addon.id)
                                : [...prev, addon.id]
                            )
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{addon.name}</p>
                          {addon.description && (
                            <p className="text-xs text-muted-foreground truncate">{addon.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {addon.promo_active && (
                            <p className="text-xs line-through text-muted-foreground">${addon.cost}</p>
                          )}
                          <p className="text-sm font-semibold">${effectivePrice.toLocaleString()}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Send Button */}
        {cartType && hasItems && (
          <div className="p-4 border-t shrink-0">
            <Button
              onClick={handleSend}
              disabled={sending}
              className="w-full h-14 text-lg bg-green-600 hover:bg-green-700 text-white"
              size="lg"
            >
              {sending ? (
                <>Sending...</>
              ) : (
                <>
                  <Send className="h-5 w-5 mr-2" />
                  Send to {customerName || "Customer"}
                </>
              )}
            </Button>
            {customerPhone && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                Will text link to {customerPhone}
              </p>
            )}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
