import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, X, Zap, Wrench, Package, Plus, Send, type LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { EquipmentCatalogBrowser } from "@/components/EquipmentCatalogBrowser";
import { RepairCatalogBrowser } from "@/components/RepairCatalogBrowser";
import { usePartsCatalog } from "@/hooks/usePartsCatalog";
import { useJobCart } from "@/hooks/useJobCart";
import { getJobCartPermissions } from "@/lib/jobCartStatus";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import type { RepairCatalogItem } from "@/components/RepairProductCard";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type MobileAddMode = "menu" | "equipment" | "repairs" | "parts" | "custom";

interface Props {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCart?: () => void;
  customerPhone?: string | null;
  customerName?: string | null;
}

const HOURLY_LABOR_RATE = 165; // fallback only when catalog has no base_price
const TIER_ORDER = ["Value", "Value Plus", "Good", "Better", "Best", "Ultimate"];
const SYSTEM_TYPE_LABELS: Record<string, string> = {
  gas_heat: "Gas Heat",
  heat_pump: "Heat Pump",
  electric: "Straight Cool",
  dual_fuel: "Dual Fuel",
};

const ORIENTATION_OPTIONS = [
  { label: "Attic", value: "Attic", applications: ["Multiposition", "Horizontal"] },
  { label: "Closet", value: "Closet", applications: ["Multiposition", "Vertical"] },
  { label: "Horizontal", value: "Horizontal", applications: ["Horizontal"] },
  { label: "Vertical", value: "Vertical", applications: ["Vertical"] },
  { label: "Multiposition", value: "Multiposition", applications: ["Multiposition"] },
];

const SPECIALTY_CUSTOM_PRESETS = [
  {
    name: "OEM replacement part - CPU/control board",
    description: "Replace failed OEM control board or electronic module. Final price is based on model, availability, and warranty status.",
  },
  {
    name: "OEM replacement part - variable-speed blower motor",
    description: "Replace OEM ECM/X13/variable-speed indoor blower motor or module assembly.",
  },
  {
    name: "OEM replacement part - condenser fan motor",
    description: "Replace job-specific OEM outdoor condenser fan motor.",
  },
  {
    name: "OEM replacement part - specialty component",
    description: "Replace job-specific OEM part that is not a standard flat-rate catalog item.",
  },
];

export function JobCartPicker({ jobId, open, onOpenChange, onOpenCart }: Props) {
  const isMobile = useIsMobile();
  const { itemCount, cart, addItem } = useJobCart(jobId);
  const permissions = getJobCartPermissions(cart, itemCount);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [mobileMode, setMobileMode] = useState<MobileAddMode>("menu");

  const handleAddEquipment = (m: EquipmentMatchup) => {
    if (!permissions.canEditItems) return;
    const systemLabel = SYSTEM_TYPE_LABELS[m.system_type || ""] || m.system_type || "System";
    const locationLabel = systemLocationLabel(m.application);
    const benefitSummary = buildEquipmentBenefitSummary(m);
    addItem.mutate({
      kind: "equipment",
      source_id: m.id,
      name: `${m.brand} ${m.tonnage ? `${m.tonnage}T` : ""} ${m.tier || ""} ${systemLabel}`.replace(/\s+/g, " ").trim(),
      description: benefitSummary,
      image_url: m.image_url || null,
      unit_price: m.total_price || 0,
      metadata: {
        ahri_number: m.ahri_number,
        seer2: m.seer2,
        eer2: m.eer2,
        hspf2: m.hspf2,
        cooling_cap: m.cooling_cap,
        afue: m.afue,
        tonnage: m.tonnage,
        brand: m.brand,
        system_type: m.system_type,
        system_type_label: systemLabel,
        tier: m.tier,
        application: m.application,
        location_label: locationLabel,
        condenser_model: m.condenser_model,
        furnace_model: m.furnace_model,
        coil_model: m.coil_model,
        heat_kit: m.heat_kit,
        ahri_certificate_path: m.ahri_certificate_path,
        factory_rebate_price: m.factory_rebate_price,
        monthly_payment: m.monthly_payment,
        monthly_payment_120: m.monthly_payment_120,
        cps_tonnage: m.cps_tonnage,
        early_rebate: m.early_rebate,
        burnout_rebate: m.burnout_rebate,
        cps_rebate_tier: m.cps_rebate_tier,
        features_benefits: normalizeFeatureBenefits(m.features_benefits),
        sales_positioning: buildEquipmentSalesPositioning(m),
        model_summary: [
          m.condenser_model,
          m.furnace_model,
          m.coil_model,
        ].filter(Boolean).join(" + "),
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

  const applyCustomPreset = (preset: (typeof SPECIALTY_CUSTOM_PRESETS)[number]) => {
    setCustomName(preset.name);
    setCustomDesc(preset.description);
  };

  const mobileBody = (
    <div className="flex h-full flex-col">
      {mobileMode === "menu" ? (
        <div className="flex-1 overflow-y-auto p-3">
          {!permissions.canEditItems && (
            <div className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {permissions.lockedReason || "This estimate cannot be edited."}
            </div>
          )}
          <div className="space-y-2">
            <MobileAddChoice
              icon={Zap}
              title="Build Equipment Presentation"
              description="Brand, tonnage, type, tier, location."
              onClick={() => setMobileMode("equipment")}
              disabled={!permissions.canEditItems}
            />
            <MobileAddChoice
              icon={Wrench}
              title="Add Repair"
              description="Common repair items and services."
              onClick={() => setMobileMode("repairs")}
              disabled={!permissions.canEditItems}
            />
            <MobileAddChoice
              icon={Package}
              title="Add Part"
              description="Parts, accessories, and add-ons."
              onClick={() => setMobileMode("parts")}
              disabled={!permissions.canEditItems}
            />
            <MobileAddChoice
              icon={Plus}
              title="Custom Item"
              description="One-off price or job-specific option."
              onClick={() => setMobileMode("custom")}
              disabled={!permissions.canEditItems}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setMobileMode("menu")}>
              Back
            </Button>
            <p className="text-sm font-semibold">
              {mobileMode === "equipment" ? "Build Presentation" : mobileMode === "repairs" ? "Add Repair" : mobileMode === "parts" ? "Add Part" : "Custom Item"}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pt-3 pb-3">
            {mobileMode === "equipment" && <GuidedEquipmentPicker onAdd={handleAddEquipment} disabled={!permissions.canEditItems} />}
            {mobileMode === "repairs" && <RepairCatalogBrowser onAddToCart={handleAddRepair} compact maxHeight="max-h-none" />}
            {mobileMode === "parts" && <PartsPickerGrid compact disabled={!permissions.canEditItems} onAdd={(p) => addItem.mutate({
              kind: "part",
              source_id: p.id,
              name: p.name,
              description: p.description,
              unit_price: p.unit_price,
            })} />}
            {mobileMode === "custom" && (
              <Card className="p-4 space-y-3">
                <SpecialtyPresetButtons onSelect={applyCustomPreset} />
                <div>
                  <Label htmlFor="mobile-custom-name">Item Name</Label>
                  <Input id="mobile-custom-name" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. OEM replacement part - CPU board" />
                </div>
                <div>
                  <Label htmlFor="mobile-custom-desc">Description (optional)</Label>
                  <Input id="mobile-custom-desc" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="What's this for?" />
                </div>
                <div>
                  <Label htmlFor="mobile-custom-price">Price ($)</Label>
                  <Input id="mobile-custom-price" type="number" inputMode="decimal" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="0.00" />
                </div>
                <Button onClick={handleAddCustom} className="w-full h-11" disabled={!permissions.canEditItems || !customName.trim() || !customPrice}>
                  <Plus className="h-4 w-4 mr-1" /> Add to Cart
                </Button>
              </Card>
            )}
          </div>
        </>
      )}
      <div className="shrink-0 border-t bg-background p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">${(cart?.total || 0).toFixed(2)}</p>
          </div>
          <Badge variant={permissions.canEditItems ? "secondary" : "outline"} className="rounded-sm">
            {cart?.status || "draft"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Back to Job
          </Button>
          <Button className="h-11" onClick={() => { onOpenChange(false); onOpenCart?.(); }}>
            Review Cart
          </Button>
        </div>
      </div>
    </div>
  );

  const body = isMobile ? mobileBody : (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="equipment" className="flex-1 flex flex-col min-h-0">
        {!permissions.canEditItems && (
          <div className="mx-3 mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {permissions.lockedReason || "This estimate cannot be edited."}
          </div>
        )}
        <TabsList className="w-full bg-muted/60 flex-wrap h-auto gap-1 p-1 mx-auto">
          <TabsTrigger value="equipment" className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Zap className="h-4 w-4" /> Equipment
          </TabsTrigger>
          <TabsTrigger value="repairs" className="flex-1 gap-1.5 data-[state=active]:bg-rose-600 data-[state=active]:text-white">
            <Wrench className="h-4 w-4" /> Repairs
          </TabsTrigger>
          <TabsTrigger value="parts" className="flex-1 gap-1.5 data-[state=active]:bg-amber-300 data-[state=active]:text-amber-950">
            <Package className="h-4 w-4" /> Parts
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex-1 gap-1.5 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Plus className="h-4 w-4" /> Custom
          </TabsTrigger>
        </TabsList>

        <div className={isMobile ? "flex-1 overflow-y-auto px-3 pt-3 pb-24" : "flex-1 overflow-y-auto px-3 pt-3 pb-28"}>
          <TabsContent value="equipment" className="mt-0">
            {isMobile ? (
              <GuidedEquipmentPicker onAdd={handleAddEquipment} disabled={!permissions.canEditItems} />
            ) : (
              <EquipmentCatalogBrowser onAddToCart={handleAddEquipment} compact={false} />
            )}
          </TabsContent>
          <TabsContent value="repairs" className="mt-0">
            <RepairCatalogBrowser onAddToCart={handleAddRepair} compact={isMobile} maxHeight={isMobile ? "max-h-none" : undefined} />
          </TabsContent>
          <TabsContent value="parts" className="mt-0">
            <PartsPickerGrid compact={isMobile} disabled={!permissions.canEditItems} onAdd={(p) => addItem.mutate({
              kind: "part",
              source_id: p.id,
              name: p.name,
              description: p.description,
              unit_price: p.unit_price,
            })} />
          </TabsContent>
          <TabsContent value="custom" className="mt-0">
            <Card className="p-4 space-y-3 max-w-md mx-auto">
              <SpecialtyPresetButtons onSelect={applyCustomPreset} />
              <div>
                <Label htmlFor="custom-name">Item Name</Label>
                <Input id="custom-name" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. OEM replacement part - CPU board" />
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
      <div className={isMobile ? "hidden" : "absolute inset-x-0 bottom-0 bg-background border-t shadow-lg p-3 z-10"}>
        <div className="flex items-center gap-2 flex-1">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold text-sm">{itemCount} item{itemCount !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground">${(cart?.total || 0).toFixed(2)}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-10" onClick={() => { onOpenChange(false); onOpenCart?.(); }}>
            Review
          </Button>
          <Button className="h-10" onClick={() => { onOpenChange(false); onOpenCart?.(); }} disabled={itemCount === 0}>
            <Send className="h-4 w-4 mr-1" /> Send
          </Button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    if (!open) return null;

    return (
      <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-background">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur">
          <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold text-foreground">
            <ShoppingCart className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate">Build Customer Presentation</span>
          </h3>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8 shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative min-h-0 flex-1">{body}</div>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Build Customer Presentation</SheetTitle>
        </SheetHeader>
        <div className="relative flex-1 min-h-0">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

function MobileAddChoice({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>
      </span>
      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function SpecialtyPresetButtons({
  onSelect,
}: {
  onSelect: (preset: (typeof SPECIALTY_CUSTOM_PRESETS)[number]) => void;
}) {
  return (
    <div className="rounded-lg border bg-violet-500/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Specialty OEM shortcuts</p>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        Use these when the part price changes by model, supplier, or availability.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SPECIALTY_CUSTOM_PRESETS.map((preset) => (
          <Button
            key={preset.name}
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-full px-2.5 text-xs"
            onClick={() => onSelect(preset)}
          >
            {preset.name.replace("OEM replacement part - ", "")}
          </Button>
        ))}
      </div>
    </div>
  );
}

function GuidedEquipmentPicker({ onAdd, disabled }: { onAdd: (m: EquipmentMatchup) => void; disabled?: boolean }) {
  const [brand, setBrand] = useState("");
  const [tonnage, setTonnage] = useState("");
  const [systemType, setSystemType] = useState("");
  const [tier, setTier] = useState("");
  const [orientation, setOrientation] = useState("");

  const { data: matchups = [], isLoading } = useQuery({
    queryKey: ["equipment_matchups_guided_picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_matchups" as any)
        .select("id, brand, system_type, tier, application, condenser_model, furnace_model, coil_model, tonnage, seer2, eer2, hspf2, cooling_cap, afue, ahri_number, component_price, total_price, factory_rebate_price, monthly_payment, monthly_payment_120, cps_tonnage, early_rebate, burnout_rebate, notes, low_margin_price, cps_rebate_tier, features_benefits, heat_kit, ahri_certificate_path, image_url, created_at")
        .order("brand")
        .order("tonnage")
        .order("tier");
      if (error) throw error;
      return (data || []) as unknown as EquipmentMatchup[];
    },
  });

  const brands = useMemo(() => unique(matchups.map((m) => m.brand)).sort(), [matchups]);
  const tonnages = useMemo(() => {
    if (!brand) return [];
    return unique(matchups.filter((m) => m.brand === brand).map((m) => m.tonnage).filter(Boolean))
      .sort((a, b) => Number(a) - Number(b))
      .map(String);
  }, [brand, matchups]);
  const systemTypes = useMemo(() => {
    if (!brand || !tonnage) return [];
    return unique(
      matchups
        .filter((m) => m.brand === brand && m.tonnage === Number(tonnage))
        .map((m) => m.system_type)
        .filter(Boolean),
    ).sort() as string[];
  }, [brand, matchups, tonnage]);
  const tiers = useMemo(() => {
    if (!brand || !tonnage || !systemType) return [];
    return (unique(
      matchups
        .filter((m) => m.brand === brand && m.tonnage === Number(tonnage) && m.system_type === systemType)
        .map((m) => m.tier)
        .filter(Boolean),
    ) as string[]).sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b));
  }, [brand, matchups, systemType, tonnage]);
  const orientations = useMemo(() => {
    if (!brand || !tonnage || !systemType || !tier) return [];
    const apps = unique(
      matchups
        .filter((m) => m.brand === brand && m.tonnage === Number(tonnage) && m.system_type === systemType && m.tier === tier)
        .map((m) => m.application)
        .filter(Boolean),
    ) as string[];
    return ORIENTATION_OPTIONS.filter((option) => option.applications.some((app) => apps.includes(app)));
  }, [brand, matchups, systemType, tier, tonnage]);

  const results = useMemo(() => {
    if (!brand || !tonnage || !systemType || !tier || !orientation) return [];
    const option = ORIENTATION_OPTIONS.find((item) => item.value === orientation);
    const acceptedApplications = option?.applications || [orientation];
    const matches = matchups.filter(
      (m) =>
        m.brand === brand &&
        m.tonnage === Number(tonnage) &&
        m.system_type === systemType &&
        m.tier === tier &&
        acceptedApplications.includes(m.application || ""),
    );
    return preferBestOrientation(matches, acceptedApplications);
  }, [brand, matchups, orientation, systemType, tier, tonnage]);

  const summaryParts = [
    brand,
    tonnage ? `${tonnage} Ton` : null,
    systemType ? SYSTEM_TYPE_LABELS[systemType] || systemType : null,
    tier,
    orientation,
  ].filter(Boolean);

  const resetAfterBrand = (value: string) => {
    setBrand(value);
    setTonnage("");
    setSystemType("");
    setTier("");
    setOrientation("");
  };
  const resetAfterTonnage = (value: string) => {
    setTonnage(value);
    setSystemType("");
    setTier("");
    setOrientation("");
  };
  const resetAfterType = (value: string) => {
    setSystemType(value);
    setTier("");
    setOrientation("");
  };
  const resetAfterTier = (value: string) => {
    setTier(value);
    setOrientation("");
  };

  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading systems...</p>;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-semibold text-foreground">Build the presentation like a tech</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pick the system in field language. The presentation sells comfort, then the cart carries price and approval.
        </p>
        {summaryParts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {summaryParts.map((part) => (
              <Badge key={part} variant="secondary" className="text-[10px]">
                {part}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <OptionStep label="Brand" options={brands} value={brand} onSelect={resetAfterBrand} />
      <OptionStep label="Tonnage" options={tonnages} value={tonnage} onSelect={resetAfterTonnage} disabled={!brand} format={(v) => `${v} Ton`} />
      <OptionStep
        label="Type"
        options={systemTypes}
        value={systemType}
        onSelect={resetAfterType}
        disabled={!tonnage}
        format={(v) => SYSTEM_TYPE_LABELS[v] || v}
      />
      <OptionStep label="Tier" options={tiers} value={tier} onSelect={resetAfterTier} disabled={!systemType} />
      <OptionStep
        label="Orientation"
        options={orientations.map((item) => item.value)}
        value={orientation}
        onSelect={setOrientation}
        disabled={!tier}
      />

      {brand && tonnage && systemType && tier && orientation && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matching systems</p>
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              No matchup for {summaryParts.join(" ")}.
            </div>
          ) : (
            results.map((matchup) => (
              <Card key={matchup.id} className="p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight text-foreground">
                      {matchup.brand} {matchup.tonnage}T {matchup.tier} {SYSTEM_TYPE_LABELS[matchup.system_type || ""] || matchup.system_type}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {matchup.application || "Any orientation"} - {matchup.seer2 ? `${matchup.seer2} SEER2` : "SEER2 not set"}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums">${Number(matchup.total_price || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-md border bg-primary/5 px-2 py-2">
                  <p className="text-xs font-semibold text-foreground">{buildEquipmentBenefitSummary(matchup)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {buildPickerBenefitChips(matchup).map((chip) => (
                      <span key={chip} className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
                  <p className="truncate">Proof: {matchup.seer2 ? `${matchup.seer2} SEER2` : "Efficiency pending"}{matchup.eer2 ? ` - ${matchup.eer2} EER2` : ""}{matchup.ahri_number ? ` - AHRI ${matchup.ahri_number}` : ""}</p>
                  <p className="truncate">Models: {[matchup.condenser_model, matchup.furnace_model, matchup.coil_model].filter(Boolean).join(" + ")}</p>
                  {Number(matchup.early_rebate || matchup.burnout_rebate || 0) > 0 && (
                    <p className="truncate text-emerald-700 dark:text-emerald-400">
                      CPS estimate: up to ${Math.max(Number(matchup.early_rebate || 0), Number(matchup.burnout_rebate || 0)).toLocaleString()}
                    </p>
                  )}
                </div>
                <Button className="h-10 w-full" onClick={() => onAdd(matchup)} disabled={disabled}>
                  <ShoppingCart className="mr-1 h-4 w-4" /> Add Presentation + Cart
                </Button>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function OptionStep({
  label,
  options,
  value,
  onSelect,
  disabled,
  format = (v) => v,
}: {
  label: string;
  options: string[];
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  format?: (value: string) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {value && <span className="text-xs font-medium text-primary">{format(value)}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {disabled ? (
          <span className="text-xs text-muted-foreground">Choose the previous step first.</span>
        ) : options.length === 0 ? (
          <span className="text-xs text-muted-foreground">No options found.</span>
        ) : (
          options.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={value === option ? "default" : "outline"}
              className="h-8 px-2.5 text-xs"
              onClick={() => onSelect(option)}
            >
              {format(option)}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizeFeatureBenefits(features: EquipmentMatchup["features_benefits"]): Array<{ icon?: string; text: string }> {
  if (!features) return [];
  if (Array.isArray(features)) {
    return features
      .map((feature) => typeof feature === "string" ? { text: feature } : feature)
      .filter((feature) => feature?.text);
  }
  if (typeof features === "string") {
    try {
      const parsed = JSON.parse(features);
      if (Array.isArray(parsed)) return normalizeFeatureBenefits(parsed as any);
    } catch {
      return features
        .split(/\n|;|\|/)
        .map((text) => ({ text: text.trim() }))
        .filter((feature) => feature.text);
    }
  }
  return [];
}

function systemLocationLabel(application: string | null) {
  if (!application) return "installed for your home";
  if (application.toLowerCase().includes("horizontal")) return "attic or horizontal installation";
  if (application.toLowerCase().includes("vertical")) return "closet or vertical installation";
  if (application.toLowerCase().includes("multi")) return "attic or closet installation";
  return `${application} installation`;
}

function buildEquipmentBenefitSummary(m: EquipmentMatchup) {
  const tier = (m.tier || "").toLowerCase();
  const type = SYSTEM_TYPE_LABELS[m.system_type || ""] || "comfort system";
  if (tier.includes("best") || tier.includes("ultimate")) {
    return `Premium ${type.toLowerCase()} focused on quieter comfort, humidity control, efficiency, and long-term peace of mind.`;
  }
  if (tier.includes("better") || tier.includes("performance")) {
    return `Balanced ${type.toLowerCase()} for stronger comfort, dependable efficiency, and a quieter home.`;
  }
  return `Reliable ${type.toLowerCase()} replacement with clean installation, warranty protection, and improved comfort.`;
}

function buildPickerBenefitChips(m: EquipmentMatchup) {
  const tier = (m.tier || "").toLowerCase();
  const chips = [
    m.seer2 ? `${m.seer2} SEER2` : null,
    m.eer2 ? `${m.eer2} EER2` : null,
  ];

  if (tier.includes("best") || tier.includes("ultimate")) {
    chips.push("quietest", "best humidity", "premium controls");
  } else if (tier.includes("better") || tier.includes("performance")) {
    chips.push("balanced comfort", "quieter", "better humidity");
  } else {
    chips.push("reliable", "warranty support", "best value");
  }

  if (Number(m.early_rebate || m.burnout_rebate || 0) > 0) chips.push("CPS rebate");
  return chips.filter(Boolean).slice(0, 5) as string[];
}

function buildEquipmentSalesPositioning(m: EquipmentMatchup) {
  const tier = (m.tier || "").toLowerCase();
  const base = [
    { title: "Comfort", body: "Sized and matched to cool evenly and help the home feel less humid." },
    { title: "Reliability", body: "Matched indoor and outdoor equipment with documented AHRI performance." },
    { title: "Peace of mind", body: "Includes registration support, install cleanup, and warranty documentation." },
    { title: "Efficiency", body: m.seer2 ? `${m.seer2} SEER2 efficiency helps reduce wasted energy compared with older equipment.` : "Modern equipment helps reduce wasted energy compared with older systems." },
  ];

  if (tier.includes("best") || tier.includes("ultimate")) {
    return [
      { title: "Quiet confidence", body: "Premium comfort profile for quieter operation and smoother temperature control." },
      { title: "Humidity control", body: "Built to help the home feel comfortable without overcooling." },
      ...base.slice(1),
    ];
  }

  if (tier.includes("better") || tier.includes("performance")) {
    return [
      { title: "Balanced comfort", body: "A strong everyday choice for comfort, efficiency, and reliability." },
      ...base.slice(1),
    ];
  }

  return base;
}

function preferBestOrientation(matchups: EquipmentMatchup[], acceptedApplications: string[]) {
  const multiposition = matchups.filter((m) => m.application === "Multiposition");
  const preferredSpecific = matchups.filter((m) => m.application && acceptedApplications.includes(m.application) && m.application !== "Multiposition");
  const pool = multiposition.length > 0 ? multiposition : preferredSpecific.length > 0 ? preferredSpecific : matchups;
  return [...pool].sort((a, b) => Number(b.seer2 || 0) - Number(a.seer2 || 0));
}

function PartsPickerGrid({
  onAdd,
  disabled = false,
  compact = false,
}: {
  onAdd: (p: { id: string; name: string; description: string | null; unit_price: number }) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
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
      <div className={compact ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"}>
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
