import { useRef, useState, useEffect } from "react";
import { PaymentOptionDivider, SavingsBadge } from "@/components/brochure/PaymentOptionDivider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Plug, Check, Minus, Plus, DollarSign, Printer, Eye, Code, ThumbsUp, Loader2, CheckCircle2, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CoverSection, TrustStrip, WhyUsSection, InstallationIncludesSection,
  ComfortIntroSection, BrandEngineeringSection, BrandOptionsHeader, SystemCard,
  ComparisonSection, CpsRebateSection, PublicServantSection, LifestyleClose, BrochureFooter,
  type BrochureBlock, type ComparisonBlock,
} from "@/components/SalesPresentationLayout";

interface AddonItem {
  id: string;
  name: string;
  description: string | null;
  detail: string | null;
  cost: number;
  sort_order: number;
}

export interface PriceBlock {
  total_price: number | null;
  factory_rebate_price: number | null;
  monthly_payment: number | null;
  monthly_payment_120: number | null;
  early_rebate: number | null;
  burnout_rebate: number | null;
  component_price: number | null;
  condenser_model: string | null;
  furnace_model: string | null;
  coil_model: string | null;
  seer2: number | null;
  eer2: number | null;
  hspf2: number | null;
  tonnage: number | null;
  ahri_number: string | null;
  cps_tonnage: number | null;
}

interface BrochurePreviewProps {
  blocks: BrochureBlock[];
  compBlocks: ComparisonBlock[];
  addons?: AddonItem[];
  isPublicServant?: boolean;
  selectedTier?: string;
  /** Pre-built price blocks from equipment_matchups, keyed by tier (lowercase) */
  priceBlocks?: Record<string, PriceBlock>;
  /** Per-job extra discount to subtract from prices */
  extraDiscount?: number;
  /** Optional job ID — when set, fetches live data from the database */
  jobId?: string;
}

const SAMPLE_SPECS: Record<string, { seer2: string; eer2: string; tonnage: string }> = {
  "Goodman S4": { seer2: "15.2", eer2: "12.2", tonnage: "3" },
  "Goodman S5": { seer2: "16.0", eer2: "13.0", tonnage: "3" },
  "Day & Night": { seer2: "15.5", eer2: "12.5", tonnage: "3" },
  "Comfort": { seer2: "16.0", eer2: "13.0", tonnage: "3" },
  "Performance": { seer2: "17.0", eer2: "13.5", tonnage: "3" },
  "Infinity": { seer2: "24.0", eer2: "16.0", tonnage: "3" },
  "Greenspeed": { seer2: "22.0", eer2: "15.0", tonnage: "3" },
};

export default function BrochurePreview({ blocks, compBlocks, addons: addonsProp, isPublicServant = true, selectedTier: selectedTierProp, priceBlocks: priceBlocksProp, extraDiscount = 0, jobId }: BrochurePreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [showFields, setShowFields] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [brandFilter, setBrandFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState(selectedTierProp || "all");
  const isTierLocked = !!selectedTierProp;

  // Live data state
  const [liveCustomerName, setLiveCustomerName] = useState<string | null>(null);
  const [livePriceBlocks, setLivePriceBlocks] = useState<Record<string, PriceBlock> | null>(null);

  useEffect(() => {
    if (!jobId) {
      setLiveCustomerName(null);
      setLivePriceBlocks(null);
      return;
    }
    const fetchLiveData = async () => {
      // 1. Fetch job details
      const { data: job } = await supabase
        .from("jobs")
        .select("customer_name, brand, tonnage, system_type")
        .eq("id", jobId)
        .single();
      if (!job) return;
      setLiveCustomerName((job as any).customer_name || "Customer");

      // 2. Fetch equipment matchups filtered by brand/tonnage/system_type
      let q = supabase.from("equipment_matchups" as any).select("*").order("tier" as any);
      if ((job as any).brand) q = q.eq("brand", (job as any).brand);
      if ((job as any).tonnage) q = q.eq("tonnage", (job as any).tonnage);
      if ((job as any).system_type) q = q.eq("system_type", (job as any).system_type);

      const { data: matchups } = await q;
      if (matchups && (matchups as any[]).length > 0) {
        // Prefer Multiposition application
        const multiKeys = new Set((matchups as any[]).filter((m: any) => m.application === "Multiposition").map((m: any) => `${m.brand}|${m.system_type}|${m.tonnage}|${m.tier}`));
        const filtered = (matchups as any[]).filter((m: any) => {
          if (m.application === "Multiposition" || !m.application) return true;
          return !multiKeys.has(`${m.brand}|${m.system_type}|${m.tonnage}|${m.tier}`);
        });
        const pb: Record<string, PriceBlock> = {};
        for (const m of filtered) {
          if (m.tier) {
            pb[m.tier.toLowerCase()] = {
              total_price: m.total_price,
              factory_rebate_price: m.factory_rebate_price,
              monthly_payment: m.monthly_payment,
              monthly_payment_120: m.monthly_payment_120,
              early_rebate: m.early_rebate,
              burnout_rebate: m.burnout_rebate,
              component_price: m.component_price,
              condenser_model: m.condenser_model,
              furnace_model: m.furnace_model,
              coil_model: m.coil_model,
              seer2: m.seer2,
              eer2: m.eer2,
              hspf2: m.hspf2,
              tonnage: m.tonnage,
              ahri_number: m.ahri_number,
              cps_tonnage: m.cps_tonnage,
            };
          }
        }
        setLivePriceBlocks(pb);
      }
    };
    fetchLiveData();
  }, [jobId]);

  const priceBlocks = livePriceBlocks || priceBlocksProp;
  const customerName = liveCustomerName || "Sample Customer";

  const FALLBACK_ADDONS: AddonItem[] = [
    { id: "1", name: "UV Air Purifier", description: "Kills mold, bacteria & viruses in your ductwork", cost: 495, detail: "REME HALO-LED® whole-home air purification.", sort_order: 0 },
    { id: "2", name: "Smart Thermostat Upgrade", description: "Wi-Fi thermostat with phone control", cost: 350, detail: "Carrier Smart Thermostat S6.", sort_order: 1 },
  ];

  const displayAddons = (addonsProp && addonsProp.length > 0) ? addonsProp : FALLBACK_ADDONS;

  const toggleAddon = (id: string) => {
    setSelectedAddons(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const addonsTotal = displayAddons.filter(a => selectedAddons.includes(a.id)).reduce((sum, a) => sum + a.cost, 0);

  // Resolve price for the currently filtered tier from priceBlocks
  const activePriceBlock = (() => {
    if (!priceBlocks || Object.keys(priceBlocks).length === 0) return null;
    // If a single tier is selected, use that
    if (tierFilter !== "all") {
      return priceBlocks[tierFilter.toLowerCase()] || null;
    }
    // Otherwise use the first available (e.g. "better" or whatever is popular)
    const preferred = ["better", "good", "best", "value", "value plus", "ultimate"];
    for (const t of preferred) {
      if (priceBlocks[t]) return priceBlocks[t];
    }
    return Object.values(priceBlocks)[0] || null;
  })();

  const fmt = (v: number | null | undefined) => v != null ? `$${Math.round(v - extraDiscount).toLocaleString()}` : "$X,XXX";
  const fmtNoDiscount = (v: number | null | undefined) => v != null ? `$${Math.round(v).toLocaleString()}` : "$XXX";
  const fmtMonthly = (v: number | null | undefined) => v != null ? `$${Math.round(v).toLocaleString()}` : "$XXX";

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    showFields ? (
      <span className="inline-flex items-center gap-1 rounded bg-blue-100 border border-blue-300 px-1.5 py-0.5 text-xs font-mono font-bold text-blue-600">
        <Code className="h-3 w-3" />
        {label}
      </span>
    ) : (
      <>{children}</>
    );

  const filteredBlocks = blocks
    .filter(b => brandFilter === "all" || b.brand === brandFilter)
    .filter(b => tierFilter === "all" || b.label === tierFilter);
  const uniqueBrands = [...new Set(blocks.map(b => b.brand))];
  const uniqueTiers = [...new Set(blocks.map(b => b.label))];
  const isSingleOption = tierFilter !== "all";

  const grouped = filteredBlocks.reduce<Record<string, BrochureBlock[]>>((acc, b) => {
    (acc[b.brand] = acc[b.brand] || []).push(b);
    return acc;
  }, {});

  return (
    <div>
      {/* Toolbar */}
      <div className="print:hidden sticky top-0 z-50 bg-background/95 backdrop-blur border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="All Brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {uniqueBrands.map(brand => (
                <SelectItem key={brand} value={brand}>{brand}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isTierLocked && (
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="All Options" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Options</SelectItem>
                {uniqueTiers.map(tier => (
                  <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button onClick={() => setShowFields(false)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                !showFields ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>
              <Eye className="h-3.5 w-3.5" /> Customer View
            </button>
            <button onClick={() => setShowFields(true)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                showFields ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>
              <Code className="h-3.5 w-3.5" /> Data Fields
            </button>
          </div>
          {showFields && <p className="text-[11px] text-primary font-medium">Highlighted fields are populated from the database for each customer</p>}
        </div>
        <Button onClick={() => window.print()} variant="outline" className="gap-2">
          <Printer className="h-4 w-4" /> Print / Export PDF
        </Button>
      </div>

      <div ref={printRef} className="bg-white">
        <CoverSection customerName={customerName} />
        <TrustStrip />
        <WhyUsSection />
        <InstallationIncludesSection />
        <ComfortIntroSection />

        {Object.entries(grouped).map(([brand, brandBlocks]) => (
          <div key={brand}>
            <BrandEngineeringSection brand={brand} />
            <div className="py-12 sm:py-16">
              {!isSingleOption && <BrandOptionsHeader brand={brand} />}
              <div className="space-y-8 mx-auto max-w-4xl px-4 sm:px-6">
                {brandBlocks.map((block, index) => {
                  const tierKey = block.label?.toLowerCase();
                  const pb = priceBlocks?.[tierKey];
                  const sample = pb
                    ? { seer2: String(pb.seer2 || ""), eer2: String(pb.eer2 || ""), hspf2: pb.hspf2 ? String(pb.hspf2) : undefined, tonnage: String(pb.tonnage || "") }
                    : SAMPLE_SPECS[block.series] || { seer2: "16.0", eer2: "13.0", tonnage: "3" };
                  const isPopular = block.label === "Better" || block.series === "Performance";
                  return (
                    <SystemCard key={block.id || index} brand={brand} label={block.label} tagline={block.tagline}
                      specs={sample} features={block.features} block={block} isPopular={isPopular} isEven={index % 2 === 1} />
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {/* ComparisonSection removed — shared as separate link */}
        {isPublicServant && <PublicServantSection />}
        <LifestyleClose />

        {/* — All pricing, rebates & money sections grouped at the end — */}
        <CpsRebateSection />

        {/* Add-ons */}
        <div className="bg-muted/30 border-y border-border py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 mb-4">
                <Plug className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Recommended Add-Ons</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Make the Most of Your New System</h2>
              <p className="mt-3 text-muted-foreground max-w-lg mx-auto">Select any you'd like included — your total updates automatically.</p>
            </div>
            <div className="space-y-3">
              {displayAddons.map(addon => {
                const isSelected = selectedAddons.includes(addon.id);
                return (
                  <div key={addon.id} className={cn("w-full rounded-xl border-2 text-left transition-all overflow-hidden",
                    isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-white hover:border-primary/30")}>
                    <button onClick={() => toggleAddon(addon.id)} className="w-full p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors",
                            isSelected ? "bg-primary border-primary" : "border-border")}>
                            {isSelected && <Check className="h-4 w-4 text-primary-foreground" />}
                          </div>
                          <div>
                            <p className={cn("text-sm font-bold", isSelected ? "text-primary" : "text-foreground")}>{addon.name}</p>
                            <p className="text-xs text-muted-foreground">{addon.description}</p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-foreground">${addon.cost.toLocaleString()}</p>
                      </div>
                    </button>
                    {isSelected && addon.detail && (
                      <div className="px-5 pb-4 pt-0 ml-12">
                        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">{addon.detail}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedAddons.length > 0 && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-5 py-3 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{selectedAddons.length} add-on{selectedAddons.length > 1 ? "s" : ""} selected</p>
                <p className="text-lg font-bold text-primary">+ ${addonsTotal}</p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Options — Choose One */}
        <div className="bg-muted/30 border-y border-border py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 mb-4">
                <DollarSign className="h-4 w-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Your Estimate</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Choose Your Payment Option</h2>
              <p className="mt-3 text-muted-foreground max-w-lg mx-auto">Pick the option that works best for your budget — CPS rebates apply either way.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative">

              {/* Option A — 0% Financing */}
              <div className="rounded-2xl border-2 border-primary/30 bg-card p-6 relative">
                <div className="absolute -top-3 left-6">
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                    Option A
                  </span>
                </div>
                <div className="text-center pt-4 pb-2">
                  <p className="text-3xl sm:text-4xl font-bold text-primary">
                    <Field label="monthly_payment">{fmtMonthly(activePriceBlock?.monthly_payment)}</Field>
                    <span className="text-lg font-normal text-muted-foreground">/mo</span>
                  </p>
                  <p className="text-sm font-bold text-foreground mt-2">No Interest · 36 Months</p>
                  <p className="text-xs text-muted-foreground mt-1">Easy monthly payments — 0% APR</p>
                </div>
                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">System Price</span>
                    <span className="font-medium"><Field label="financed_price">{fmt(activePriceBlock?.total_price)}</Field></span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> CPS Energy Rebate</span>
                    <span className="font-medium text-accent"><Field label="cps_rebate">– {fmtNoDiscount(activePriceBlock?.early_rebate)}</Field></span>
                  </div>
                  {selectedAddons.length > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Add-Ons</span>
                      <span className="font-medium">+ ${addonsTotal.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Option B — 9.99% APR · 120 Mo (Plan 943) — Lowest Monthly */}
              <div className="rounded-2xl border-2 border-amber-300 bg-card p-6 relative">
                <div className="absolute -top-3 left-6">
                  <span className="bg-amber-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                    Option B
                  </span>
                </div>
                <div className="text-center pt-4 pb-2">
                  <p className="text-3xl sm:text-4xl font-bold text-amber-600">
                    <Field label="monthly_payment_120">{fmtMonthly(activePriceBlock?.monthly_payment_120)}</Field>
                    <span className="text-lg font-normal text-muted-foreground">/mo</span>
                  </p>
                  <p className="text-sm font-bold text-foreground mt-2">9.99% APR · 120 Months</p>
                  <p className="text-xs text-muted-foreground mt-1">Lowest monthly payment — Plan 943</p>
                </div>
                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">System Price</span>
                    <span className="font-medium"><Field label="financed_price">{fmt(activePriceBlock?.total_price)}</Field></span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> CPS Energy Rebate</span>
                    <span className="font-medium text-accent"><Field label="cps_rebate">– {fmtNoDiscount(activePriceBlock?.early_rebate)}</Field></span>
                  </div>
                  {selectedAddons.length > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Add-Ons</span>
                      <span className="font-medium">+ ${addonsTotal.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Option C — Instant Factory Rebate */}
              <div className="rounded-2xl border-2 border-emerald-300 bg-card p-6 relative">
                <div className="absolute -top-3 left-6">
                  <span className="bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                    Option C
                  </span>
                </div>
                <SavingsBadge amount={activePriceBlock?.total_price != null && activePriceBlock?.factory_rebate_price != null
                  ? fmt(activePriceBlock.total_price - activePriceBlock.factory_rebate_price)
                  : "$0"} />
                <div className="text-center pt-4 pb-2">
                  <p className="text-3xl sm:text-4xl font-bold text-emerald-600">
                    <Field label="factory_rebate_price">{activePriceBlock?.factory_rebate_price != null
                      ? fmt(activePriceBlock.factory_rebate_price)
                      : "$X,XXX"}</Field>
                  </p>
                  <p className="text-sm font-bold text-foreground mt-2">Instant Factory Rebate</p>
                  <p className="text-xs text-muted-foreground mt-1">Cash · Check · Credit Card</p>
                </div>
                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">System Price</span>
                    <span className="font-medium"><Field label="financed_price">{fmt(activePriceBlock?.total_price)}</Field></span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-600">
                    <span className="flex items-center gap-1"><Minus className="h-3 w-3" /> Factory Rebate</span>
                    <span className="font-semibold"><Field label="factory_rebate">– {activePriceBlock?.total_price != null && activePriceBlock?.factory_rebate_price != null ? fmt(activePriceBlock.total_price - activePriceBlock.factory_rebate_price) : "$0"}</Field></span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> CPS Energy Rebate</span>
                    <span className="font-medium text-accent"><Field label="cps_rebate">– {fmtNoDiscount(activePriceBlock?.early_rebate)}</Field></span>
                  </div>
                  {selectedAddons.length > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Add-Ons</span>
                      <span className="font-medium">+ ${addonsTotal.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-muted-foreground mt-4">
              * CPS Energy rebates are applied regardless of payment option. The Instant Factory Rebate option is available with cash, check, or credit-card payment.
            </p>
          </div>
        </div>

        <BrochureFooter />
      </div>
    </div>
  );
}
