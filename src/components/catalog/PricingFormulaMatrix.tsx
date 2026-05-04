import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  ChevronRight,
  Settings,
  Plus,
  Save,
  X,
  BookOpen,
  Calculator,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { usePricingFormulas, calculatePrices, DEFAULT_FORMULA, type PricingFormula } from "@/hooks/usePricingFormulas";
import { calcMonthly36, calcMonthly120 } from "@/lib/paymentOptions";
import { BRANDS, TIERS, useEquipmentMatchups, type EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import { PricingCheatSheetSheet } from "./PricingCheatSheetSheet";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const RECALC_SETTING_KEY = "pricing_last_recalc_at";

type SkippedRow = { id: string; brand: string; tier: string | null; reason: string };
type RecalcResult = {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  skippedRows: SkippedRow[];
};

const SAMPLE_EQUIP_COST = 3000;

type CellKey = string; // `${brand}|${tier ?? '__default__'}`

const cellKey = (brand: string, tier: string | null): CellKey => `${brand}|${tier ?? "__default__"}`;

interface FieldDef {
  key: keyof typeof DEFAULT_FORMULA;
  label: string;
  prefix?: string;
  suffix?: string;
  step?: string;
}

const FIELDS: FieldDef[] = [
  { key: "materials_fee", label: "Materials", prefix: "$", step: "10" },
  { key: "labor_fee", label: "Labor", prefix: "$", step: "10" },
  { key: "profit_fee", label: "Profit", prefix: "$", step: "10" },
  { key: "tax_rate", label: "Tax", suffix: "%", step: "0.01" },
  { key: "finance_rate", label: "Finance", suffix: "%", step: "0.1" },
  { key: "cash_rebate", label: "Rebate", prefix: "$", step: "10" },
];

const ROW_BRANDS = ["default", ...BRANDS] as const;
const COL_TIERS: (string | null)[] = [null, ...TIERS];

export function PricingFormulaMatrix() {
  const { formulas, upsertFormula, getFormula } = usePricingFormulas();
  const { matchups, recalculateAll } = useEquipmentMatchups();
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
  const [recalcProgress, setRecalcProgress] = useState<{ done: number; total: number } | null>(null);
  const [recalcResult, setRecalcResult] = useState<RecalcResult | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingCell, setEditingCell] = useState<CellKey | null>(null);
  const [draft, setDraft] = useState<typeof DEFAULT_FORMULA | null>(null);
  const [showInherited, setShowInherited] = useState(true);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [previewCell, setPreviewCell] = useState<CellKey>(cellKey("default", null));

  // Server-side last recalc timestamp (shared across devices/browsers)
  const { data: lastRecalcAt } = useQuery({
    queryKey: ["company_settings", RECALC_SETTING_KEY],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", RECALC_SETTING_KEY)
        .maybeSingle();
      return (data?.value as string) || null;
    },
  });

  const matchupsWithPrice = useMemo(
    () => matchups.filter((m) => m.component_price != null).length,
    [matchups],
  );

  // Latest formula update timestamp
  const latestFormulaUpdate = useMemo(() => {
    if (!formulas.length) return null;
    return formulas.reduce((max, f) => (f.updated_at > max ? f.updated_at : max), formulas[0].updated_at);
  }, [formulas]);

  const isStale = useMemo(() => {
    if (!latestFormulaUpdate) return false;
    if (!lastRecalcAt) return true; // never recalculated → stale
    return new Date(latestFormulaUpdate) > new Date(lastRecalcAt);
  }, [latestFormulaUpdate, lastRecalcAt]);

  // Audit: matchups with no tier OR no resolvable formula (excluding global default)
  const auditRows = useMemo(() => {
    const hasFormulaForBrandTier = (brand: string, tier: string | null): boolean => {
      if (formulas.some((f) => f.brand === brand && f.tier === tier)) return true;
      if (formulas.some((f) => f.brand === brand && f.tier === null)) return true;
      if (tier && formulas.some((f) => f.brand === "default" && f.tier === tier)) return true;
      return false;
    };
    return matchups
      .filter((m) => m.component_price != null)
      .map((m) => {
        const tier = m.tier?.trim() || null;
        if (!tier) return { matchup: m, reason: "No tier assigned" as const };
        if (!hasFormulaForBrandTier(m.brand, tier))
          return { matchup: m, reason: `No formula for ${m.brand} · ${tier}` };
        return null;
      })
      .filter((x): x is { matchup: EquipmentMatchup; reason: string } => x !== null);
  }, [matchups, formulas]);

  const handleRecalcAll = async () => {
    const ok = await confirm({
      title: "Recalculate all matchups?",
      description: `This will re-price ${matchupsWithPrice} matchup${matchupsWithPrice === 1 ? "" : "s"} using the current pricing formulas. Rows without a tier or with no matching brand+tier formula will be SKIPPED (not silently re-priced with the global default). Quotes already sent to customers (snapshots) are not affected.`,
      confirmText: "Recalculate",
    });
    if (!ok) return;
    setRecalcProgress({ done: 0, total: matchupsWithPrice });
    try {
      const result = await recalculateAll.mutateAsync(((done: number, total: number) => {
        setRecalcProgress({ done, total });
      }) as any);
      setRecalcResult(result as RecalcResult);
      const now = new Date().toISOString();
      // Persist server-side so all devices/browsers see the same "last recalc"
      await supabase
        .from("company_settings")
        .upsert({ key: RECALC_SETTING_KEY, value: now }, { onConflict: "key" });
      // Clean up old per-browser value if present
      try {
        localStorage.removeItem("pricing_last_recalc_at");
      } catch (err) {
        console.warn("[PricingFormulaMatrix] Could not clear browser-only recalc timestamp:", err);
      }
      queryClient.invalidateQueries({ queryKey: ["company_settings", RECALC_SETTING_KEY] });
    } finally {
      setRecalcProgress(null);
    }
  };

  // Build a quick map: brand+tier -> explicit formula (if any)
  const explicitMap = useMemo(() => {
    const m = new Map<CellKey, PricingFormula>();
    for (const f of formulas) m.set(cellKey(f.brand, f.tier), f);
    return m;
  }, [formulas]);

  const previewFormula = useMemo(() => {
    const [brand, tierKey] = previewCell.split("|");
    const tier = tierKey === "__default__" ? null : tierKey;
    return getFormula(brand, tier);
  }, [previewCell, getFormula]);

  const previewBreakdown = useMemo(
    () => calculatePrices(SAMPLE_EQUIP_COST, previewFormula),
    [previewFormula],
  );

  const startEdit = (brand: string, tier: string | null) => {
    const key = cellKey(brand, tier);
    const explicit = explicitMap.get(key);
    const base = explicit ?? getFormula(brand, tier);
    setEditingCell(key);
    setDraft({
      materials_fee: Number(base.materials_fee) || 0,
      tax_rate: Number(base.tax_rate) || 0,
      labor_fee: Number(base.labor_fee) || 0,
      profit_fee: Number(base.profit_fee) || 0,
      finance_rate: Number(base.finance_rate) || 0,
      cash_rebate: Number(base.cash_rebate) || 0,
    });
    setPreviewCell(key);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setDraft(null);
  };

  const saveEdit = async (brand: string, tier: string | null) => {
    if (!draft) return;
    try {
      await upsertFormula.mutateAsync({ brand, tier, ...draft });
      toast({ title: "Saved", description: `Updated ${brand === "default" ? "Global Default" : brand}${tier ? ` · ${tier}` : ""}` });
      setEditingCell(null);
      setDraft(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  const cellSummary = (brand: string, tier: string | null) => {
    const explicit = explicitMap.get(cellKey(brand, tier));
    return {
      explicit,
      effective: getFormula(brand, tier),
      isInherited: !explicit,
    };
  };

  const renderCell = (brand: string, tier: string | null) => {
    const key = cellKey(brand, tier);
    const isEditing = editingCell === key;
    const isPreview = previewCell === key;
    const { explicit, effective, isInherited } = cellSummary(brand, tier);

    if (isEditing && draft) {
      return (
        <td
          key={key}
          className="border border-border align-top p-2 bg-primary/5 min-w-[220px]"
        >
          <div className="space-y-1.5">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-1.5">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground w-14 shrink-0">{f.label}</Label>
                <div className="relative flex-1">
                  {f.prefix && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{f.prefix}</span>}
                  <Input
                    type="number"
                    step={f.step}
                    value={draft[f.key]}
                    onChange={(e) => setDraft({ ...draft, [f.key]: parseFloat(e.target.value) || 0 })}
                    className={cn("h-7 text-xs tabular-nums", f.prefix && "pl-4", f.suffix && "pr-5")}
                  />
                  {f.suffix && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{f.suffix}</span>}
                </div>
              </div>
            ))}
            <div className="flex gap-1 pt-1">
              <Button size="sm" className="h-6 px-2 text-[11px] flex-1" onClick={() => saveEdit(brand, tier)} disabled={upsertFormula.isPending}>
                <Save className="h-3 w-3 mr-1" />Save
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={cancelEdit}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </td>
      );
    }

    // Inherited cell
    if (isInherited) {
      return (
        <td
          key={key}
          onClick={() => startEdit(brand, tier)}
          className={cn(
            "border border-border align-top p-2 cursor-pointer transition-colors min-w-[160px]",
            "hover:bg-accent/50",
            isPreview && "ring-2 ring-primary ring-inset",
          )}
        >
          {showInherited ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 italic">
                <span>inherited</span>
              </div>
              <div className="text-[10px] text-muted-foreground/60 tabular-nums leading-tight">
                Mat ${effective.materials_fee} · Lab ${effective.labor_fee}
                <br />
                Profit ${effective.profit_fee} · Fin {effective.finance_rate}%
                {effective.cash_rebate > 0 && <><br />Reb ${effective.cash_rebate}</>}
              </div>
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] w-full justify-start text-primary opacity-0 group-hover:opacity-100 hover:bg-primary/10">
                <Plus className="h-2.5 w-2.5 mr-1" />Override
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-12 text-muted-foreground/40 text-xs">—</div>
          )}
        </td>
      );
    }

    // Explicit override cell
    return (
      <td
        key={key}
        onClick={() => startEdit(brand, tier)}
        className={cn(
          "border border-border align-top p-2 cursor-pointer transition-colors min-w-[160px] group",
          "bg-card hover:bg-accent/50",
          explicit!.cash_rebate > 0 && "bg-emerald-50/40 dark:bg-emerald-950/10",
          isPreview && "ring-2 ring-primary ring-inset",
        )}
      >
        <div className="space-y-1">
          <div className="text-[10px] tabular-nums text-foreground leading-tight">
            <div className="flex justify-between"><span className="text-muted-foreground">Mat</span><span className="font-medium">${explicit!.materials_fee}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Lab</span><span className="font-medium">${explicit!.labor_fee}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className="font-medium">${explicit!.profit_fee}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-medium">{explicit!.tax_rate}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fin</span><span className="font-medium">{explicit!.finance_rate}%</span></div>
            {explicit!.cash_rebate > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Rebate</span><span className="font-semibold">${explicit!.cash_rebate}</span>
              </div>
            )}
          </div>
        </div>
      </td>
    );
  };

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const monthly36 = calcMonthly36(previewBreakdown.financedPrice) ?? 0;     // 0% APR · 36 mo
  const monthly120 = calcMonthly120(previewBreakdown.financedPrice) ?? 0;   // 9.99% APR · 120 mo (Plan 943)

  const [previewBrand, previewTierKey] = previewCell.split("|");
  const previewTierLabel = previewTierKey === "__default__" ? "Default" : previewTierKey;
  const previewBrandLabel = previewBrand === "default" ? "Global Default" : previewBrand;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 group">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Settings className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Pricing Formulas</CardTitle>
                <Badge variant="secondary" className="text-[10px] h-5">
                  {formulas.length} override{formulas.length === 1 ? "" : "s"}
                </Badge>
              </button>
            </CollapsibleTrigger>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Switch
                  id="show-inherited"
                  checked={showInherited}
                  onCheckedChange={setShowInherited}
                  className="scale-75"
                />
                <Label htmlFor="show-inherited" className="text-xs text-muted-foreground cursor-pointer">
                  Show inherited
                </Label>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setCheatOpen(true)}>
                <BookOpen className="h-3.5 w-3.5" />
                Cheat sheet
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 text-xs gap-1",
                  auditRows.length > 0 && "text-amber-600 dark:text-amber-400 hover:text-amber-700",
                )}
                onClick={() => setAuditOpen(true)}
                title="Find matchups missing tier or matching formula"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Audit ({auditRows.length})
              </Button>
              <Button
                variant={isStale ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-7 text-xs gap-1 relative",
                  isStale && "bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/30",
                )}
                onClick={handleRecalcAll}
                disabled={recalculateAll.isPending || matchupsWithPrice === 0}
                title={
                  isStale
                    ? "Formulas changed since last recalc — matchup prices are out of date"
                    : `Re-price all ${matchupsWithPrice} matchups using current formulas`
                }
              >
                {recalculateAll.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {recalcProgress ? `${recalcProgress.done} / ${recalcProgress.total}` : "Recalculating…"}
                  </>
                ) : (
                  <>
                    {isStale && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                      </span>
                    )}
                    <RefreshCw className={cn("h-3.5 w-3.5", isStale && "animate-pulse")} />
                    {isStale ? `Recalc Needed (${matchupsWithPrice})` : `Recalculate All (${matchupsWithPrice})`}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-3 sm:p-4 pt-0 space-y-3">
            {isStale && (
              <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 flex items-center gap-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <div className="flex-1 text-amber-900 dark:text-amber-200">
                  <strong>Formulas have changed since the last recalc.</strong> Matchup prices in the database are out of date — click <em>Recalc Needed</em> above to apply your changes.
                </div>
                {lastRecalcAt && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 shrink-0">
                    Last recalc: {new Date(lastRecalcAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}
            {/* Live preview strip */}
            <div className="rounded-md border border-border bg-gradient-to-r from-primary/5 via-card to-primary/5 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Calculator className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Example with <strong className="text-foreground">${fmt(SAMPLE_EQUIP_COST)}</strong> equipment cost on{" "}
                  <strong className="text-foreground">{previewBrandLabel} · {previewTierLabel}</strong>:
                </span>
                <div className="flex items-center gap-3 text-xs ml-auto flex-wrap">
                  <span>
                    <span className="text-muted-foreground">Low Margin</span>{" "}
                    <span className="font-semibold text-primary tabular-nums">${fmt(previewBreakdown.lowestMarginPrice)}</span>
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>
                    <span className="text-muted-foreground">Financed</span>{" "}
                    <span className="font-semibold text-primary tabular-nums">${fmt(previewBreakdown.financedPrice)}</span>
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>
                    <span className="text-muted-foreground">36mo @ 0%</span>{" "}
                    <span className="font-semibold text-sky-600 dark:text-sky-400 tabular-nums">${fmt(monthly36)}/mo</span>
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>
                    <span className="text-muted-foreground">120mo @ 9.99%</span>{" "}
                    <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">${fmt(monthly120)}/mo</span>
                  </span>
                  {previewFormula.cash_rebate > 0 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span>
                        <span className="text-muted-foreground">Instant Rebate</span>{" "}
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">${fmt(previewBreakdown.factoryRebatePrice)}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Matrix grid */}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="border border-border p-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-semibold sticky left-0 bg-muted/80 z-20 min-w-[140px]">
                      Brand
                    </th>
                    {COL_TIERS.map((t) => (
                      <th
                        key={t ?? "__default__"}
                        className="border border-border p-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground font-semibold min-w-[160px]"
                      >
                        {t ?? "Default"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROW_BRANDS.map((brand) => (
                    <tr key={brand} className="group">
                      <th className="border border-border p-2 text-left font-semibold text-foreground bg-muted/30 sticky left-0 z-10 align-top">
                        {brand === "default" ? (
                          <div>
                            <div className="text-xs">Global Default</div>
                            <div className="text-[10px] text-muted-foreground font-normal">fallback for all brands</div>
                          </div>
                        ) : (
                          <div className="text-xs">{brand}</div>
                        )}
                      </th>
                      {COL_TIERS.map((tier) => renderCell(brand, tier))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Click any cell to edit. Recalculation uses{" "}
              <strong>Brand+Tier → Brand Default → Global Tier</strong>. The Global Default cell is{" "}
              <strong>not</strong> used as a silent fallback — rows with no resolvable formula are skipped.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <PricingCheatSheetSheet open={cheatOpen} onOpenChange={setCheatOpen} />

      {/* Recalc results dialog */}
      <Dialog open={!!recalcResult} onOpenChange={(o) => !o && setRecalcResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {recalcResult && recalcResult.skipped + recalcResult.failed === 0 ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  All matchups recalculated
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Recalculation complete — review skipped rows
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Recalculation finished. Skipped rows were NOT re-priced (no silent fallback to Global Default).
            </DialogDescription>
          </DialogHeader>

          {recalcResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-md border border-border p-2">
                  <div className="text-2xl font-bold tabular-nums">{recalcResult.total}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
                </div>
                <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-2">
                  <div className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {recalcResult.updated}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-emerald-700/70 dark:text-emerald-500/70">
                    Updated
                  </div>
                </div>
                <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-2">
                  <div className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {recalcResult.skipped}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-500/70">
                    Skipped
                  </div>
                </div>
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  <div className="text-2xl font-bold tabular-nums text-destructive">{recalcResult.failed}</div>
                  <div className="text-[10px] uppercase tracking-wide text-destructive/70">Failed</div>
                </div>
              </div>

              {recalcResult.skippedRows.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground">Skipped rows:</div>
                  <ScrollArea className="h-48 rounded-md border border-border">
                    <div className="p-2 space-y-1">
                      {recalcResult.skippedRows.map((r) => {
                        const m = matchups.find((x) => x.id === r.id);
                        return (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-accent text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">
                                {r.brand} · {m?.condenser_model ?? "(unknown model)"}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{r.reason}</div>
                            </div>
                            <Badge variant="outline" className="text-[9px] shrink-0">
                              {r.tier ?? "no tier"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  <p className="text-[10px] text-muted-foreground">
                    Fix these in the Equipment Catalog by assigning a proper tier, then run Recalculate again.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRecalcResult(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit dialog */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Untiered / Unmatched Matchups
            </DialogTitle>
            <DialogDescription>
              Matchups that would be skipped during recalculation. Assign a proper tier (or add a brand+tier formula)
              to bring them into the strict pricing pipeline.
            </DialogDescription>
          </DialogHeader>

          {auditRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mb-2" />
              <p className="text-sm font-medium">All matchups are properly tiered.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Safe to delete the Global Default formula row if you want a hard tripwire.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-96 rounded-md border border-border">
              <div className="p-2 space-y-1">
                {auditRows.map(({ matchup, reason }) => (
                  <div
                    key={matchup.id}
                    className="flex items-center justify-between gap-2 rounded px-2 py-2 hover:bg-accent text-xs border border-border/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {matchup.brand} · {matchup.condenser_model}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {reason} · component ${matchup.component_price?.toFixed(0) ?? "—"}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      {matchup.tier?.trim() || "NO TIER"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAuditOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
