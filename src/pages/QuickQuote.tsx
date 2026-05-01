import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Copy, Zap, ArrowLeft, Send, Link2, Loader2, ExternalLink, FileText, Upload, Eye, Sparkles, MessageSquare } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import { useCreatePresentation } from "@/hooks/useEstimatePresentations";
import { usePricingFormulas, DEFAULT_FORMULA, type PricingFormula } from "@/hooks/usePricingFormulas";
import { renderInstallQuote, type CompanyContact, type RenderedQuote } from "@/lib/quoteTemplate";
import { PaymentOptionStack } from "@/components/pricing/PaymentOptionStack";
import { useCreateQuickQuoteLink } from "@/hooks/useQuickQuoteLinks";
import { useSectionOrder } from "@/hooks/useSectionOrder";
import { SortableSectionShell } from "@/components/layout/SortableSectionShell";
import { SectionReorderToolbar } from "@/components/layout/SectionReorderToolbar";
import { GoodBetterBestPicker } from "@/components/tiers/GoodBetterBestPicker";
import { TierPresetManager } from "@/components/tiers/TierPresetManager";
import { useAuth } from "@/hooks/useAuth";
import { useCapacitor } from "@/hooks/useCapacitor";
import { errorMessage } from "@/lib/errorMessage";
import { openSmsComposer } from "@/lib/smsComposerBridge";

const QUICK_QUOTE_SECTION_IDS = ["filters", "tiers", "results", "presentation"] as const;
type QuickQuoteSectionId = (typeof QUICK_QUOTE_SECTION_IDS)[number];
const QUICK_QUOTE_SECTION_LABELS: Record<QuickQuoteSectionId, string> = {
  filters: "Filters",
  tiers: "Good / Better / Best",
  results: "Matchup Results",
  presentation: "Presentation Preview",
};
const TIER_SCOPE = "quick_quote_default";

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  gas_heat: "Gas / AC",
  heat_pump: "Heat Pump",
  electric: "Electric",
  dual_fuel: "Dual Fuel",
};

const LOCATION_ORIENTATIONS: Record<string, string[]> = {
  Attic: ["Multiposition", "Horizontal"],
  Closet: ["Multiposition", "Vertical"],
};

export default function QuickQuote() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Estimate / Job context from URL params
  const estimateId = searchParams.get("estimate_id") || "";
  const jobId = searchParams.get("job_id") || "";
  const customerName = searchParams.get("customer_name") || "";
  const customerPhone = searchParams.get("customer_phone") || "";
  const customerEmail = searchParams.get("customer_email") || "";

  const [brand, setBrand] = useState<string>("");
  const [tonnage, setTonnage] = useState<string>("");
  const [systemType, setSystemType] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [location, setLocation] = useState<string>("");

  // Presentation state
  const [presentationToken, setPresentationToken] = useState<string | null>(null);
  const createPresentation = useCreatePresentation();
  const { formulas, isError: pricingError, error: pricingQueryError } = usePricingFormulas();
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const createQuickQuoteLink = useCreateQuickQuoteLink();
  const [creatingViewId, setCreatingViewId] = useState<string | null>(null);
  const [textingId, setTextingId] = useState<string | null>(null);
  const [tierManagerOpen, setTierManagerOpen] = useState(false);
  const { user } = useAuth();

  const {
    draftOrder,
    setDraftOrder,
    editing,
    setEditing,
    dirty,
    save,
    reset,
    cancel,
    isSaving,
  } = useSectionOrder<QuickQuoteSectionId>("quick_quote_admin", QUICK_QUOTE_SECTION_IDS);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDraftOrder((prev) => {
        const oldIdx = prev.indexOf(active.id as QuickQuoteSectionId);
        const newIdx = prev.indexOf(over.id as QuickQuoteSectionId);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  // Load company contact info for the rendered quote
  const { data: company, isError: companyError, error: companyQueryError } = useQuery<CompanyContact>({
    queryKey: ["company_contact_for_quote"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("key, value")
        .in("key", ["company_name", "company_phone", "company_address", "company_city", "company_state", "company_zip", "tacla_number"]);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data || []) map[(row as any).key] = (row as any).value;
      return {
        name: map.company_name || "Carnes and Sons Air Conditioning",
        phone: map.company_phone || "210-600-5091",
        address: map.company_address || "9988 Macaway Road",
        city: map.company_city || "Adkins",
        state: map.company_state || "Texas",
        zip: map.company_zip || "78101",
        tacla: map.tacla_number || "TACLB29435E",
      };
    },
  });

  // Fetch all matchups once
  const { data: allMatchups = [], isLoading, isError: matchupsError, error: matchupsQueryError } = useQuery({
    queryKey: ["equipment_matchups_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_matchups" as any)
        .select("*")
        .order("tonnage")
        .order("tier");
      if (error) throw error;
      return data as unknown as EquipmentMatchup[];
    },
  });

  function getFormulaFor(brand: string, tier: string | null): PricingFormula | typeof DEFAULT_FORMULA {
    const exact = formulas.find((f) => f.brand === brand && f.tier === tier);
    if (exact) return exact;
    const brandDefault = formulas.find((f) => f.brand === brand && f.tier === null);
    if (brandDefault) return brandDefault;
    const globalTier = formulas.find((f) => f.brand === "default" && f.tier === tier);
    if (globalTier) return globalTier;
    const globalDefault = formulas.find((f) => f.brand === "default" && f.tier === null);
    if (globalDefault) return globalDefault;
    return DEFAULT_FORMULA;
  }

  function buildRendered(m: EquipmentMatchup): RenderedQuote | null {
    if (!company) return null;
    const formula = getFormulaFor(m.brand, m.tier ?? null);
    return renderInstallQuote(m, formula, company);
  }


  // Cascading filter options
  const brands = useMemo(() => [...new Set(allMatchups.map((m) => m.brand))].sort(), [allMatchups]);

  const tonnages = useMemo(() => {
    if (!brand) return [];
    return [...new Set(allMatchups.filter((m) => m.brand === brand).map((m) => m.tonnage))].filter(Boolean).sort((a, b) => (a ?? 0) - (b ?? 0));
  }, [allMatchups, brand]);

  const systemTypes = useMemo(() => {
    if (!brand || !tonnage) return [];
    return [...new Set(allMatchups.filter((m) => m.brand === brand && m.tonnage === Number(tonnage)).map((m) => m.system_type))].filter(Boolean).sort();
  }, [allMatchups, brand, tonnage]);

  const availableTiers = useMemo(() => {
    if (!brand || !tonnage || !systemType) return [];
    const tierOrder = ["Value", "Value Plus", "Good", "Better", "Best", "Ultimate"];
    const found = [...new Set(
      allMatchups
        .filter((m) => m.brand === brand && m.tonnage === Number(tonnage) && m.system_type === systemType)
        .map((m) => m.tier)
    )].filter(Boolean) as string[];
    return found.sort((a, b) => tierOrder.indexOf(a) - tierOrder.indexOf(b));
  }, [allMatchups, brand, tonnage, systemType]);

  const applications = useMemo(() => {
    if (!brand || !tonnage || !systemType) return [];
    return [...new Set(
      allMatchups
        .filter((m) =>
          m.brand === brand &&
          m.tonnage === Number(tonnage) &&
          m.system_type === systemType &&
          (!tier || m.tier === tier)
        )
        .map((m) => m.application)
    )].filter(Boolean).sort() as string[];
  }, [allMatchups, brand, tonnage, systemType, tier]);

  const availableLocations = useMemo(() => {
    const locs: string[] = [];
    if (applications.includes("Multiposition") || applications.includes("Horizontal")) locs.push("Attic");
    if (applications.includes("Multiposition") || applications.includes("Vertical")) locs.push("Closet");
    return locs;
  }, [applications]);

  // Filtered results
  const results = useMemo(() => {
    if (!brand || !tonnage || !systemType || !location) return [];
    const orientations = LOCATION_ORIENTATIONS[location] || ["Multiposition"];
    const matches = allMatchups.filter(
      (m) =>
        m.brand === brand &&
        m.tonnage === Number(tonnage) &&
        m.system_type === systemType &&
        (!tier || m.tier === tier) &&
        orientations.includes(m.application || "")
    );
    // Dedupe by tier — always prefer Multiposition when available, then higher SEER2
    const byTier = new Map<string, EquipmentMatchup>();
    for (const m of matches) {
      const t = m.tier || "—";
      const existing = byTier.get(t);
      if (!existing) {
        byTier.set(t, m);
        continue;
      }
      const incomingIsMulti = m.application === "Multiposition";
      const existingIsMulti = existing.application === "Multiposition";
      // Rule: Multiposition always wins over orientation-specific
      if (incomingIsMulti && !existingIsMulti) {
        byTier.set(t, m);
        continue;
      }
      if (!incomingIsMulti && existingIsMulti) continue;
      // Same orientation class — pick higher SEER2
      if ((m.seer2 ?? 0) > (existing.seer2 ?? 0)) {
        byTier.set(t, m);
      }
    }
    const tierOrder = ["Value", "Value Plus", "Good", "Better", "Best", "Ultimate"];
    return [...byTier.values()].sort(
      (a, b) => tierOrder.indexOf(a.tier || "") - tierOrder.indexOf(b.tier || "")
    );
  }, [allMatchups, brand, tonnage, systemType, tier, location]);

  // Reset downstream when upstream changes
  const handleBrandChange = (v: string) => { setBrand(v); setTonnage(""); setSystemType(""); setTier(""); setLocation(""); setPresentationToken(null); };
  const handleTonnageChange = (v: string) => { setTonnage(v); setSystemType(""); setTier(""); setLocation(""); setPresentationToken(null); };
  const handleSystemTypeChange = (v: string) => { setSystemType(v); setTier(""); setLocation(""); setPresentationToken(null); };
  const handleTierChange = (v: string) => { setTier(v === "__any__" ? "" : v); setLocation(""); setPresentationToken(null); };
  const handleLocationChange = (v: string) => { setLocation(v); setPresentationToken(null); };

  const quoteDataIssues = [
    matchupsError ? `equipment database (${errorMessage(matchupsQueryError)})` : null,
    pricingError ? `pricing formulas (${errorMessage(pricingQueryError)})` : null,
    companyError ? `company contact settings (${errorMessage(companyQueryError)})` : null,
  ].filter(Boolean);

  const formatQuoteText = (m: EquipmentMatchup) => {
    const rendered = buildRendered(m);
    if (rendered) return rendered.description;
    // Fallback short list if company info hasn't loaded yet
    return `${m.brand} ${m.tonnage}T ${SYSTEM_TYPE_LABELS[m.system_type || ""] || m.system_type}`;
  };

  const copyToClipboard = (m: EquipmentMatchup) => {
    navigator.clipboard.writeText(formatQuoteText(m));
    toast({ title: "Full quote copied to clipboard" });
  };

  const copyAllToClipboard = () => {
    const text = results.map(formatQuoteText).join("\n\n─────────────────\n\n");
    navigator.clipboard.writeText(text);
    toast({ title: `${results.length} quotes copied` });
  };

  // Push the rendered quote into the linked job's line items so it appears on the HCP estimate
  const pushToHcpEstimate = async (m: EquipmentMatchup) => {
    if (!estimateId) {
      toast({ title: "No estimate linked", description: "Open the quote builder from an estimate to enable Push to HCP.", variant: "destructive" });
      return;
    }
    const rendered = buildRendered(m);
    if (!rendered) {
      toast({ title: "Company info still loading", variant: "destructive" });
      return;
    }
    setPushingId(m.id);
    try {
      // Resolve the underlying job_id for the estimate
      const { data: est, error: estErr } = await supabase
        .from("estimates" as any)
        .select("source_job_id")
        .eq("id", estimateId)
        .maybeSingle();
      if (estErr) throw estErr;
      const jobId = (est as any)?.source_job_id;
      if (!jobId) throw new Error("This estimate has no linked job — push from a job-linked estimate.");

      const unitPrice = rendered.financedPrice ?? m.total_price ?? 0;
      const itemName = `${m.brand} ${m.tonnage}T ${SYSTEM_TYPE_LABELS[m.system_type || ""] || m.system_type} (${m.tier || "—"})`;

      const { error: insErr } = await supabase.from("job_line_items" as any).insert({
        job_id: jobId,
        name: itemName,
        description: rendered.description,
        quantity: 1,
        unit_price: unitPrice,
        total_price: unitPrice,
        kind: "equipment",
      } as any);
      if (insErr) throw insErr;

      toast({ title: "Pushed to HCP estimate", description: "Line item added with full description and price." });
    } catch (e: any) {
      toast({ title: "Push failed", description: e.message, variant: "destructive" });
    } finally {
      setPushingId(null);
    }
  };

  // Create a customer-facing /q/:token link and open it in a new tab
  const viewAsCustomer = async (m: EquipmentMatchup) => {
    if (!company) {
      toast({ title: "Company info still loading", variant: "destructive" });
      return;
    }
    setCreatingViewId(m.id);
    try {
      const rendered = buildRendered(m);
      const link = await createQuickQuoteLink.mutateAsync({
        matchup: m,
        rendered,
        company,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        estimate_id: estimateId || null,
        job_id: jobId || null,
      });
      // Use current origin so preview links work in preview, prod in prod.
      const url = `${window.location.origin}/q/${link.token}`;
      window.open(url, "_blank", "noopener,noreferrer");
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Customer view opened", description: "Link copied to clipboard." });
      } catch {
        toast({ title: "Customer view opened", description: "Clipboard was blocked, so copy the link from the new tab." });
      }
    } finally {
      setCreatingViewId(null);
    }
  };

  // Create a customer-facing /q/:token link AND draft an SMS to the customer
  const textQuoteToCustomer = async (m: EquipmentMatchup) => {
    if (!company) {
      toast({ title: "Company info still loading", variant: "destructive" });
      return;
    }
    if (!customerPhone) {
      toast({ title: "No customer phone on file", description: "Open the quote builder from a job or estimate card.", variant: "destructive" });
      return;
    }
    setTextingId(m.id);
    try {
      const rendered = buildRendered(m);
      const link = await createQuickQuoteLink.mutateAsync({
        matchup: m,
        rendered,
        company,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        estimate_id: estimateId || null,
        job_id: jobId || null,
      });
      const url = `${window.location.origin}/q/${link.token}`;
      const firstName = (customerName || "").split(" ")[0] || "there";
      const sysLabel = `${m.brand} ${m.tonnage ? `${m.tonnage}T ` : ""}${m.system_type || "system"}`.trim();
      const body = `Hi ${firstName}, the Carnes family put together your ${sysLabel} quote with a few clear options. You can review it here and text us back with any questions: ${url}`;
      openSmsComposer(customerPhone, {
        contactName: customerName || undefined,
        jobId: jobId || undefined,
        draft: body,
      });
      toast({ title: "Quote ready to send", description: "Approval link drafted in SMS." });
    } catch (e: any) {
      toast({ title: "Failed to prepare SMS", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setTextingId(null);
    }
  };

  const handleCreatePresentation = async () => {
    if (!estimateId || results.length === 0) return;
    try {
      const pricingSnapshot = buildPresentationSnapshot(results);

      const presentation = await createPresentation.mutateAsync({
        estimate_id: estimateId,
        customer_email: customerEmail || null as any,
        pricing_snapshot: pricingSnapshot,
        selected_tiers: results.map((m) => m.tier || ""),
      });

      setPresentationToken(presentation.token);
      toast({ title: "Presentation created!" });
    } catch (e: any) {
      toast({ title: "Failed to create presentation", description: e.message, variant: "destructive" });
    }
  };

  const presentationUrl = presentationToken ? `${window.location.origin}/presentation/${presentationToken}` : null;

  const handleTextToCustomer = () => {
    if (!presentationUrl || !customerPhone) return;
    const firstName = customerName.split(" ")[0] || "there";
    const body = `Hi ${firstName}, the Carnes family has your system replacement quote ready when you have a minute. You can review it here and text us back with any questions: ${presentationUrl}`;
    openSmsComposer(customerPhone, {
      contactName: customerName || undefined,
      jobId: jobId || undefined,
      draft: body,
    });
  };

  const handleCopyLink = () => {
    if (!presentationUrl) return;
    navigator.clipboard.writeText(presentationUrl);
    toast({ title: "Link copied to clipboard" });
  };

  const sectionMap: Record<QuickQuoteSectionId, React.ReactNode> = {
    filters: (
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Brand</label>
              <Select value={brand} onValueChange={handleBrandChange}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Tonnage</label>
              <Select value={tonnage} onValueChange={handleTonnageChange} disabled={!brand}>
                <SelectTrigger><SelectValue placeholder="Select tonnage" /></SelectTrigger>
                <SelectContent>
                  {tonnages.map((t) => <SelectItem key={String(t)} value={String(t)}>{t} Ton</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">System Type</label>
              <Select value={systemType} onValueChange={handleSystemTypeChange} disabled={!tonnage}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {systemTypes.map((st) => <SelectItem key={st!} value={st!}>{SYSTEM_TYPE_LABELS[st!] || st}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Tier</label>
              <Select value={tier || "__any__"} onValueChange={handleTierChange} disabled={!systemType}>
                <SelectTrigger><SelectValue placeholder="Any tier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any tier</SelectItem>
                  {availableTiers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Install Location</label>
              <Select value={location} onValueChange={handleLocationChange} disabled={!systemType}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {availableLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    ),
    tiers: (
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <CardTitle className="text-base">Good · Better · Best</CardTitle>
          </div>
          {user && (
            <Button size="sm" variant="outline" onClick={() => setTierManagerOpen(true)}>
              Curate Tiers
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <GoodBetterBestPicker
            scope={TIER_SCOPE}
            onSelect={(m) => {
              setBrand(m.brand);
              if (m.tonnage) setTonnage(String(m.tonnage));
              if (m.system_type) setSystemType(m.system_type);
              if (m.tier) setTier(m.tier);
              toast({ title: `Loaded ${m.brand} ${m.tier}`, description: "Pick an install location to finish." });
            }}
            ctaLabel="Use this tier"
          />
        </CardContent>
      </Card>
    ),
    results: (
      <>
        {isLoading && <p className="text-muted-foreground text-center">Loading equipment data…</p>}
        {results.length > 0 ? renderResultsBlock() : !isLoading && brand && tonnage && systemType && location ? (
          <Card className="border-destructive/40">
            <CardContent className="py-12 text-center text-destructive">
              <p className="font-semibold mb-1">No matchup found</p>
              <p className="text-sm text-muted-foreground">
                No matchup for {brand} {tonnage} ton {SYSTEM_TYPE_LABELS[systemType] || systemType} ({location}) — add it in Equipment Matchups before quoting.
              </p>
            </CardContent>
          </Card>
        ) : !brand && !isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Select a brand, or pick a Good/Better/Best tier above to start a quote.
            </CardContent>
          </Card>
        ) : null}
      </>
    ),
    presentation: presentationToken && presentationUrl ? (
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-primary" />
            Presentation Preview
          </CardTitle>
          <p className="text-xs text-muted-foreground">This is exactly what your customer will see</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <div className="relative rounded-[2rem] border-4 border-foreground/20 bg-black p-2 shadow-2xl" style={{ width: 395, height: 710 }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-foreground/20 rounded-b-xl z-10" />
              <iframe
                src={presentationUrl}
                className="w-full h-full rounded-[1.5rem] bg-white"
                title="Presentation Preview"
                style={{ width: 375, height: 690 }}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-center pt-2">
            {customerPhone && (
              <Button onClick={handleTextToCustomer} className="gap-2">
                <Send className="h-4 w-4" />
                Text Quote to Customer
              </Button>
            )}
            <Button variant="outline" onClick={handleCopyLink} className="gap-2">
              <Link2 className="h-4 w-4" />
              Copy Link
            </Button>
          </div>
        </CardContent>
      </Card>
    ) : null,
  };

  return (
    <div className="min-h-screen">
      {user && (
        <SectionReorderToolbar
          editing={editing}
          dirty={dirty}
          isSaving={isSaving}
          onEdit={() => setEditing(true)}
          onSave={save}
          onReset={reset}
          onCancel={cancel}
          hint="Drag sections to permanently rearrange Quote Builder"
        />
      )}
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-primary">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-accent" />
            <h1 className="text-2xl font-bold text-foreground">Quote Builder</h1>
          </div>
          {customerName && (
            <span className="text-sm text-muted-foreground ml-auto">
              for <strong className="text-foreground">{customerName}</strong>
            </span>
          )}
        </div>

        {quoteDataIssues.length > 0 ? (
          <Card className="border-amber-300 bg-amber-50 text-amber-950">
            <CardContent className="flex gap-3 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Quote Builder is open, but part of the quote data did not load.</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Missing {quoteDataIssues.join(", ")}. Refresh before texting a customer or copying a final quote.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draftOrder} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {draftOrder.map((id) => (
                <SortableSectionShell
                  key={id}
                  id={id}
                  editing={editing}
                  label={QUICK_QUOTE_SECTION_LABELS[id]}
                >
                  {sectionMap[id]}
                </SortableSectionShell>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <TierPresetManager
        scope={TIER_SCOPE}
        scopeLabel="Quote Builder"
        open={tierManagerOpen}
        onOpenChange={setTierManagerOpen}
      />
    </div>
  );

  function renderResultsBlock() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{results.length} option{results.length !== 1 ? "s" : ""} found</p>
          <div className="flex gap-2">
            {estimateId && !presentationToken && (
              <Button
                variant="default"
                size="sm"
                onClick={handleCreatePresentation}
                disabled={createPresentation.isPending}
              >
                {createPresentation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                Create Presentation
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={copyAllToClipboard}>
              <Copy className="h-4 w-4 mr-1" /> Copy All
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((m) => (
            <Card key={m.id} className="relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">
                {m.tier || "—"}
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-base pr-16">
                  {m.brand} {m.tonnage}T {SYSTEM_TYPE_LABELS[m.system_type || ""] || m.system_type}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{m.application}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Models</p>
                  <p>Condenser: <span className="font-mono text-xs">{m.condenser_model}</span></p>
                  {m.coil_model && <p>Coil: <span className="font-mono text-xs">{m.coil_model}</span></p>}
                  {m.furnace_model && <p>Furnace: <span className="font-mono text-xs">{m.furnace_model}</span></p>}
                  {m.heat_kit && <p>Heat Kit: <span className="font-mono text-xs">{m.heat_kit}</span></p>}
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Efficiency</p>
                  <p>AHRI: <span className="font-mono text-xs">{m.ahri_number || "—"}</span></p>
                  <div className="flex gap-3 text-xs">
                    <span>SEER2: <strong>{m.seer2 ?? "—"}</strong></span>
                    <span>EER2: <strong>{m.eer2 ?? "—"}</strong></span>
                    {m.hspf2 && <span>HSPF2: <strong>{m.hspf2}</strong></span>}
                  </div>
                  <p className="text-xs">Cooling: <strong>{m.cooling_cap ? `${m.cooling_cap.toLocaleString()} BTU` : "—"}</strong></p>
                  {m.afue && <p className="text-xs">AFUE: <strong>{m.afue}%</strong></p>}
                  <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md bg-success/10 border border-success/30">
                    <span className="text-success font-bold text-sm">✓</span>
                    <span className="text-xs font-bold text-success uppercase tracking-wide">10 Year Parts Warranty</span>
                  </div>
                </div>
                {(m.total_price || m.factory_rebate_price) && (
                  <div className="border-t pt-2">
                    <PaymentOptionStack
                      financed={Number(m.total_price ?? 0)}
                      monthly36={Number(m.monthly_payment ?? 0)}
                      monthly120={Number((m as any).monthly_payment_120 ?? 0)}
                      rebatePrice={Number(m.factory_rebate_price ?? m.total_price ?? 0)}
                      compact
                    />
                    {(m.early_rebate || m.burnout_rebate) && (
                      <div className="text-xs space-y-0.5 bg-muted/50 rounded p-1.5 mt-2">
                        <p className="font-medium">
                          CPS Rebates {m.cps_rebate_tier ? `(${m.cps_rebate_tier})` : ""}
                          <span className="text-muted-foreground font-normal"> — applies to any option</span>
                        </p>
                        {m.early_rebate && <p>Early: <strong className="text-success">-${m.early_rebate.toLocaleString()}</strong></p>}
                        {m.burnout_rebate && <p>Burnout: <strong className="text-success">-${m.burnout_rebate.toLocaleString()}</strong></p>}
                        <p className="text-[11px] text-muted-foreground italic pt-1 border-t border-border/50 mt-1">
                          ✓ We gather all the paperwork &amp; info you need to make submitting your CPS rebate quick and easy.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-1.5 mt-1">
                  <Button variant="outline" size="sm" className="w-full" onClick={() => copyToClipboard(m)}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy Full Quote
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setExpandedQuoteId(expandedQuoteId === m.id ? null : m.id)}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    {expandedQuoteId === m.id ? "Hide" : "Preview"} Full Quote
                  </Button>
                  {estimateId && (
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full"
                      onClick={() => pushToHcpEstimate(m)}
                      disabled={pushingId === m.id}
                    >
                      {pushingId === m.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                      Push to HCP Estimate
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => viewAsCustomer(m)}
                    disabled={creatingViewId === m.id || !company}
                  >
                    {creatingViewId === m.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    View as Customer
                  </Button>
                  {customerPhone && (
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full"
                      onClick={() => textQuoteToCustomer(m)}
                      disabled={textingId === m.id || !company}
                    >
                      {textingId === m.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5 mr-1" />}
                      Text Quote to Customer
                    </Button>
                  )}
                </div>
                {expandedQuoteId === m.id && (
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs font-mono text-foreground">
                    {formatQuoteText(m)}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
}

function tierKey(tier?: string | null) {
  const lower = (tier || "").toLowerCase();
  if (lower.includes("ultimate") || lower.includes("best")) return "best";
  if (lower.includes("performance") || lower.includes("better") || lower.includes("plus")) return "better";
  return "good";
}

function normalizeQuoteFeatures(features: EquipmentMatchup["features_benefits"]) {
  if (!features) return [];
  if (Array.isArray(features)) {
    return features
      .map((feature: any) => typeof feature === "string" ? { icon: "check", text: feature } : feature)
      .filter((feature: any) => feature?.text);
  }
  if (typeof features === "string") {
    try {
      const parsed = JSON.parse(features);
      if (Array.isArray(parsed)) return normalizeQuoteFeatures(parsed as any);
    } catch {
      return features
        .split(/\n|;|\|/)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ icon: "check", text }));
    }
  }
  return [];
}

function presentationOption(m: EquipmentMatchup) {
  const systemLabel = (m.system_type || "Comfort System").replace(/_/g, " ");
  return {
    id: m.id,
    brand: m.brand,
    tier: m.tier,
    label: `${m.brand} ${m.tonnage ? `${m.tonnage} Ton ` : ""}${m.tier || ""} ${systemLabel}`.replace(/\s+/g, " ").trim(),
    description: m.notes || `${m.brand} ${m.tier || ""} system focused on comfort, reliability, efficiency, and peace of mind.`.replace(/\s+/g, " ").trim(),
    tonnage: m.tonnage,
    system_type: m.system_type,
    application: m.application,
    condenser_model: m.condenser_model,
    coil_model: m.coil_model,
    furnace_model: m.furnace_model,
    heat_kit: m.heat_kit,
    seer2: m.seer2,
    eer2: m.eer2,
    hspf2: m.hspf2,
    cooling_cap: m.cooling_cap,
    afue: m.afue,
    ahri_number: m.ahri_number,
    price: Number(m.total_price || 0),
    total_price: Number(m.total_price || 0),
    monthly_payment: m.monthly_payment,
    monthly_payment_120: m.monthly_payment_120,
    factory_rebate_price: m.factory_rebate_price,
    early_rebate: m.early_rebate,
    burnout_rebate: m.burnout_rebate,
    cps_rebate_tier: m.cps_rebate_tier,
    features_benefits: normalizeQuoteFeatures(m.features_benefits),
  };
}

function buildPresentationSnapshot(matchups: EquipmentMatchup[]) {
  const systemOptions: Record<string, any> = {};

  for (const matchup of matchups) {
    const baseKey = tierKey(matchup.tier);
    const key = systemOptions[baseKey] ? `${baseKey}_${matchup.id.slice(0, 6)}` : baseKey;
    systemOptions[key] = presentationOption(matchup);
  }

  return {
    cart_type: "new_system",
    system_options: systemOptions,
    addons: [],
    generated_from: "quick_quote",
    option_count: Object.keys(systemOptions).length,
  };
}
