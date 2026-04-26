import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sparkles, Wand2, AlertTriangle, Check, X, RotateCcw, TrendingUp, Activity, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import {
  useRepairPricingFormulas,
  type RepairPricingFormula,
} from "@/hooks/useRepairPricingFormulas";
import { RepairPricingCsvIO } from "@/components/catalog/RepairPricingCsvIO";

const CATEGORIES = [
  "Electrical",
  "Refrigerant",
  "Airflow",
  "Motors",
  "Controls",
  "Safety",
  "Drainage",
  "Upgrades",
  "General",
];

interface CellEdit {
  category: string;
  field: "flat_rate_multiplier" | "member_discount" | "margin_floor";
  value: string;
}

export function RepairPricingMatrix() {
  const {
    formulas,
    items,
    getFormula,
    upsertFormula,
    deleteCategoryOverride,
    recalculateAll,
    bumpFlagged,
    getMarginHealth,
  } = useRepairPricingFormulas();

  const globalFormula = useMemo(
    () => getFormula("default"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formulas]
  );

  // Local draft of global dials
  const [draftMult, setDraftMult] = useState<number | null>(null);
  const [draftMember, setDraftMember] = useState<number | null>(null);
  const [draftFloor, setDraftFloor] = useState<number | null>(null);

  const mult = draftMult ?? globalFormula.flat_rate_multiplier;
  const member = draftMember ?? globalFormula.member_discount;
  const floor = draftFloor ?? globalFormula.margin_floor;

  const dirty =
    Math.abs(mult - globalFormula.flat_rate_multiplier) > 0.001 ||
    Math.abs(member - globalFormula.member_discount) > 0.001 ||
    Math.abs(floor - globalFormula.margin_floor) > 0.001;

  // Recalc state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMax, setProgressMax] = useState(0);

  // Per-cell edit
  const [cellEdit, setCellEdit] = useState<CellEdit | null>(null);

  // Collapse state — both panels start collapsed for a tidier page
  const [dialsOpen, setDialsOpen] = useState(false);
  const [overridesOpen, setOverridesOpen] = useState(false);

  const eligible = items.filter((i) => !i.manual_price_override && Number(i.base_price ?? 0) > 0);
  const skipped = items.length - eligible.length;

  const health = useMemo(
    () => getMarginHealth(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, formulas]
  );

  const saveGlobal = async () => {
    await upsertFormula.mutateAsync({
      category: "default",
      flat_rate_multiplier: mult,
      member_discount: member,
      margin_floor: floor,
    });
    setDraftMult(null);
    setDraftMember(null);
    setDraftFloor(null);
    toast({ title: "Global dials saved" });
  };

  const handleRecalc = async () => {
    if (dirty) await saveGlobal();
    setConfirmOpen(false);
    setRunning(true);
    setProgress(0);
    setProgressMax(eligible.length);
    try {
      const result = await recalculateAll((done, total) => {
        setProgress(done);
        setProgressMax(total);
      });
      toast({
        title: "Repricing complete",
        description: `Updated ${result.updated} of ${result.total} repairs · ${result.skipped} locked & skipped`,
      });
    } catch (e: any) {
      toast({ title: "Repricing failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const handleBumpFlagged = async () => {
    const n = await bumpFlagged(0.1);
    toast({
      title: `Bumped ${n} flagged repair${n === 1 ? "" : "s"} +10%`,
      description: "Margin floors re-checked after recalculation.",
    });
  };

  const saveCell = async () => {
    if (!cellEdit) return;
    const val = parseFloat(cellEdit.value);
    if (isNaN(val)) {
      setCellEdit(null);
      return;
    }
    const f = getFormula(cellEdit.category);
    const next: Omit<RepairPricingFormula, "id" | "created_at" | "updated_at"> = {
      category: cellEdit.category,
      flat_rate_multiplier: f.flat_rate_multiplier,
      member_discount: f.member_discount,
      margin_floor: f.margin_floor,
      [cellEdit.field]: val,
    } as any;
    await upsertFormula.mutateAsync(next);
    setCellEdit(null);
    toast({ title: "Category override saved" });
  };

  const formatPct = (n: number) => `${Math.round(n * 100)}%`;
  const formatMult = (n: number) => `${n.toFixed(2)}×`;

  const aboveFloorPct = health.total > 0 ? (health.okCount / health.total) * 100 : 100;

  return (
    <div className="space-y-3">
      {/* CSV IMPORT/EXPORT */}
      <RepairPricingCsvIO />

      {/* GLOBAL DIALS */}
      <Collapsible open={dialsOpen} onOpenChange={setDialsOpen} asChild>
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 text-left flex-1 -m-1 p-1 rounded hover:bg-muted/40 transition-colors"
                  aria-expanded={dialsOpen}
                >
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${dialsOpen ? "" : "-rotate-90"}`} />
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-primary" />
                    Repair Pricing Dials
                    <Badge variant="outline" className="text-[10px] font-medium">Global</Badge>
                    {!dialsOpen && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        · {formatMult(mult)} · Club {formatPct(member)} · Floor {formatPct(floor)}
                      </span>
                    )}
                  </CardTitle>
                </button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-2 shrink-0">
                {dirty && (
                  <Button size="sm" variant="ghost" onClick={() => { setDraftMult(null); setDraftMember(null); setDraftFloor(null); }}>
                    Reset
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  disabled={running}
                  className="gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {dirty ? "Save & Apply" : "Apply to Repairs"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Multiplier */}
              <DialRow
                label="Flat-Rate Multiplier"
                hint="Bumps every flat rate up or down across the board"
                value={formatMult(mult)}
                badgeColor="bg-primary/10 text-primary"
              >
                <Slider
                  value={[mult]}
                  min={0.8}
                  max={1.5}
                  step={0.01}
                  onValueChange={([v]) => setDraftMult(v)}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>0.80×</span><span>1.00×</span><span>1.50×</span>
                </div>
              </DialRow>

              {/* Member discount */}
              <DialRow
                label="Comfort Club Discount"
                hint="Discount off base price for Club members"
                value={formatPct(member)}
                badgeColor="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              >
                <Slider
                  value={[member * 100]}
                  min={0}
                  max={30}
                  step={1}
                  onValueChange={([v]) => setDraftMember(v / 100)}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>0%</span><span>15%</span><span>30%</span>
                </div>
              </DialRow>

              {/* Margin floor */}
              <DialRow
                label="Healthy-Margin Floor"
                hint="Display only — flags items with margin below this as ⚠️"
                value={formatPct(floor)}
                badgeColor="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                <Slider
                  value={[floor * 100]}
                  min={40}
                  max={85}
                  step={1}
                  onValueChange={([v]) => setDraftFloor(v / 100)}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>40%</span><span>65%</span><span>85%</span>
                </div>
              </DialRow>

              <div className="text-[11px] text-muted-foreground border-t border-border/60 pt-2 leading-relaxed">
                <code className="text-foreground/80">base = flat_rate × multiplier</code> &nbsp;·&nbsp;
                <code className="text-foreground/80">member = base × (1 − discount)</code> &nbsp;·&nbsp;
                <code className="text-foreground/80">margin = (base − parts) ÷ base</code>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* MARGIN HEALTH */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            Pricing Health
            <span className="text-xs font-normal text-muted-foreground">
              {health.total} active repairs · avg margin {formatPct(health.avgMargin)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Progress value={aboveFloorPct} className="h-2 flex-1" />
            <span className="text-xs font-semibold tabular-nums w-12 text-right">
              {Math.round(aboveFloorPct)}%
            </span>
            <span className="text-[11px] text-muted-foreground">above floor</span>
          </div>
          {health.belowFloorCount > 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {health.belowFloorCount} below margin floor
                </span>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleBumpFlagged}>
                  <TrendingUp className="h-3 w-3" />
                  Bump flagged +10%
                </Button>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {health.belowFloor.slice(0, 8).map((it) => (
                  <li key={it.id} className="flex items-center justify-between text-xs">
                    <span className="truncate flex-1 mr-2">{it.name}</span>
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                      ${it.base_price.toFixed(0)} · parts ${it.parts_cost.toFixed(0)} →{" "}
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">
                        {formatPct(it.margin)}
                      </span>
                    </span>
                  </li>
                ))}
                {health.belowFloor.length > 8 && (
                  <li className="text-[11px] text-muted-foreground italic">
                    + {health.belowFloor.length - 8} more…
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              All repairs are above their margin floor.
            </div>
          )}
        </CardContent>
      </Card>

      {/* PER-CATEGORY OVERRIDES */}
      <Collapsible open={overridesOpen} onOpenChange={setOverridesOpen} asChild>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-left w-full -m-1 p-1 rounded hover:bg-muted/40 transition-colors"
                aria-expanded={overridesOpen}
              >
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${overridesOpen ? "" : "-rotate-90"}`} />
                <CardTitle className="text-sm">Per-Category Overrides</CardTitle>
                {!overridesOpen && (
                  <span className="text-[11px] font-normal text-muted-foreground ml-auto">
                    Click to expand
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Multiplier</TableHead>
                <TableHead className="text-xs">Member %</TableHead>
                <TableHead className="text-xs">Margin Floor</TableHead>
                <TableHead className="text-xs">Health</TableHead>
                <TableHead className="text-xs w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CATEGORIES.map((cat) => {
                const override = formulas.find((f) => f.category === cat);
                const eff = getFormula(cat);
                const stat = health.byCategory[cat] || { total: 0, ok: 0, below: 0 };
                return (
                  <TableRow key={cat}>
                    <TableCell className="font-medium text-sm">{cat}</TableCell>
                    {(["flat_rate_multiplier", "member_discount", "margin_floor"] as const).map((field) => {
                      const isOverride = override?.[field] !== undefined && override?.[field] !== null;
                      const value = eff[field];
                      const isEditing = cellEdit?.category === cat && cellEdit?.field === field;
                      const display = field === "flat_rate_multiplier" ? formatMult(value) : formatPct(value);
                      return (
                        <TableCell key={field}>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                step={field === "flat_rate_multiplier" ? "0.01" : "1"}
                                value={cellEdit.value}
                                autoFocus
                                onChange={(e) => setCellEdit({ ...cellEdit, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveCell();
                                  if (e.key === "Escape") setCellEdit(null);
                                }}
                                className="h-7 text-xs w-20"
                              />
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveCell}>
                                <Check className="h-3 w-3 text-emerald-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCellEdit(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              className={`text-xs px-2 py-1 rounded hover:bg-muted transition-colors ${
                                isOverride ? "font-semibold text-foreground" : "text-muted-foreground italic"
                              }`}
                              onClick={() => {
                                const startVal =
                                  field === "flat_rate_multiplier"
                                    ? value.toFixed(2)
                                    : Math.round(value * 100).toString();
                                setCellEdit({ category: cat, field, value: startVal });
                              }}
                            >
                              {isOverride ? display : `inherit (${display})`}
                            </button>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      {stat.total === 0 ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : stat.below === 0 ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          {stat.ok} OK
                        </span>
                      ) : (
                        <span className="text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400">{stat.ok} OK</span>
                          {" / "}
                          <span className="text-amber-600 dark:text-amber-400">{stat.below} ⚠️</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {override && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          title="Reset to global"
                          onClick={async () => {
                            await deleteCategoryOverride.mutateAsync(cat);
                            toast({ title: `Reset ${cat} to global` });
                          }}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* PROGRESS BAR (during recalc) */}
      {running && (
        <Card className="border-primary">
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Repricing repairs…</span>
              <span className="tabular-nums text-muted-foreground">
                {progress} / {progressMax}
              </span>
            </div>
            <Progress value={progressMax > 0 ? (progress / progressMax) * 100 : 0} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* CONFIRM DIALOG */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprice {eligible.length} repairs?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This will multiply each repair's base price by its category multiplier
                  {dirty && " (saving your dial changes first)"} and round to <code>.49</code>.
                </p>
                <p className="text-muted-foreground">
                  • {eligible.length} repairs will update
                  <br />
                  • {skipped} repairs are locked (manual override) and will be skipped
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecalc}>
              Save &amp; Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DialRow({
  label,
  hint,
  value,
  badgeColor,
  children,
}: {
  label: string;
  hint: string;
  value: string;
  badgeColor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
        <span className={`text-sm font-bold tabular-nums px-2.5 py-0.5 rounded ${badgeColor}`}>
          {value}
        </span>
      </div>
      {children}
    </div>
  );
}
