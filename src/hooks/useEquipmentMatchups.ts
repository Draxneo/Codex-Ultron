import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calculatePrices, DEFAULT_FORMULA, type PricingFormula } from "@/hooks/usePricingFormulas";
import { calcMonthly36, calcMonthly120 } from "@/lib/paymentOptions";

export const TIERS = ["Value", "Value Plus", "Good", "Better", "Best", "Ultimate"] as const;
export const APPLICATIONS = ["Multiposition", "Vertical", "Horizontal"] as const;

export interface EquipmentMatchup {
  id: string;
  brand: string;
  system_type: string | null;
  tier: string | null;
  application: string | null;
  condenser_model: string;
  furnace_model: string | null;
  coil_model: string | null;
  tonnage: number | null;
  seer2: number | null;
  eer2: number | null;
  hspf2: number | null;
  cooling_cap: number | null;
  afue: number | null;
  ahri_number: string | null;
  ahri_certificate_path: string | null;
  heat_kit: string | null;
  component_price: number | null;
  total_price: number | null;
  factory_rebate_price: number | null;
  monthly_payment: number | null;
  monthly_payment_120: number | null;
  cps_tonnage: number | null;
  early_rebate: number | null;
  burnout_rebate: number | null;
  notes: string | null;
  low_margin_price: number | null;
  cps_rebate_tier: string | null;
  features_benefits: { icon: string; text: string }[] | string | null;
  created_at: string;
}

// CPS BTUh-to-Tons lookup (matches CPS Energy form)
export function cpsBtuhToTons(btuh: number): number {
  if (btuh < 18000) return 1.0;
  if (btuh < 21000) return 1.5;
  if (btuh < 27000) return 2.0;
  if (btuh < 33000) return 2.5;
  if (btuh < 39000) return 3.0;
  if (btuh < 45000) return 3.5;
  if (btuh < 54000) return 4.0;
  return 5.0;
}

// CPS SEER2 tier rates
const CPS_TIERS = [
  { min: 13.8, max: 15.1, earlyPer: 115, burnoutPer: 90 },
  { min: 15.2, max: 16.1, earlyPer: 130, burnoutPer: 120 },
  { min: 16.2, max: 17.0, earlyPer: 175, burnoutPer: 150 },
  { min: 17.1, max: 19.9, earlyPer: 250, burnoutPer: 225 },
  { min: 20.0, max: 99,   earlyPer: 310, burnoutPer: 275 },
];

export function getCpsRebateTierLabel(seer2: number | null): string | null {
  if (seer2 == null) return null;
  const idx = CPS_TIERS.findIndex(t => seer2 >= t.min && seer2 <= t.max);
  return idx >= 0 ? `Tier ${idx + 1}` : null;
}

export function calculateCpsRebates(cooling_cap: number | null, seer2: number | null) {
  if (cooling_cap == null || seer2 == null) return { cps_tonnage: null, early_rebate: null, burnout_rebate: null, cps_rebate_tier: getCpsRebateTierLabel(seer2) };
  const tons = cpsBtuhToTons(cooling_cap);
  const tier = CPS_TIERS.find(t => seer2 >= t.min && seer2 <= t.max);
  if (!tier) return { cps_tonnage: tons, early_rebate: null, burnout_rebate: null, cps_rebate_tier: null };
  return { cps_tonnage: tons, early_rebate: tons * tier.earlyPer, burnout_rebate: tons * tier.burnoutPer, cps_rebate_tier: getCpsRebateTierLabel(seer2) };
}

const BRANDS = ["Carrier", "Day and Night", "Goodman", "Trane", "Armstrong", "Ducane"] as const;
const SYSTEM_TYPES = ["gas_heat", "heat_pump", "electric", "dual_fuel"] as const;
export { BRANDS, SYSTEM_TYPES };

// Helper to fetch the applicable pricing formula from DB
async function fetchFormula(brand: string, tier: string | null): Promise<typeof DEFAULT_FORMULA> {
  const { data } = await supabase
    .from("pricing_formulas" as any)
    .select("*")
    .order("brand")
    .order("tier");
  const formulas = (data || []) as unknown as PricingFormula[];

  const exact = formulas.find((f) => f.brand === brand && f.tier === tier);
  if (exact) return exact;
  const brandDefault = formulas.find((f) => f.brand === brand && f.tier === null);
  if (brandDefault) return brandDefault;
  const globalTierDefault = formulas.find((f) => f.brand === "default" && f.tier === tier);
  if (globalTierDefault) return globalTierDefault;
  const globalDefault = formulas.find((f) => f.brand === "default" && f.tier === null);
  if (globalDefault) return globalDefault;
  return DEFAULT_FORMULA;
}

export function useEquipmentMatchups(brand?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["equipment_matchups", brand],
    queryFn: async () => {
      let q = supabase
        .from("equipment_matchups" as any)
        .select("*")
        .order("tonnage")
        .order("condenser_model");
      if (brand) q = q.eq("brand", brand);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EquipmentMatchup[];
    },
  });

  const addMatchup = useMutation({
    mutationFn: async (matchup: Omit<EquipmentMatchup, "id" | "created_at">) => {
      const rebates = calculateCpsRebates(matchup.cooling_cap, matchup.seer2);
      const withPrices = { ...matchup, ...rebates };

      // Auto-calculate installed prices from pricing formula
      if (withPrices.component_price != null) {
        const formula = await fetchFormula(withPrices.brand, withPrices.tier ?? null);
        const prices = calculatePrices(withPrices.component_price, formula);
        withPrices.low_margin_price = Math.round(prices.lowestMarginPrice * 100) / 100;
        withPrices.total_price = Math.round(prices.financedPrice * 100) / 100;
        withPrices.factory_rebate_price = Math.round(prices.factoryRebatePrice * 100) / 100;
        withPrices.monthly_payment = calcMonthly36(withPrices.total_price);
        withPrices.monthly_payment_120 = calcMonthly120(withPrices.total_price);
      }

      const { data, error } = await supabase
        .from("equipment_matchups" as any)
        .insert(withPrices as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
      toast({ title: "Equipment matchup added" });
    },
  });

  const updateMatchup = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EquipmentMatchup> & { id: string }) => {
      // Recalculate CPS rebates if cooling_cap or seer2 changed
      if ('cooling_cap' in updates || 'seer2' in updates) {
        const rebates = calculateCpsRebates(
          updates.cooling_cap ?? null,
          updates.seer2 ?? null
        );
        Object.assign(updates, rebates);
      }

      // Auto-calculate installed prices if component_price is present
      if ('component_price' in updates && updates.component_price != null) {
        const brand = updates.brand ?? 'default';
        const tier = updates.tier !== undefined ? updates.tier : null;
        const formula = await fetchFormula(brand, tier);
        const prices = calculatePrices(updates.component_price, formula);
        updates.low_margin_price = Math.round(prices.lowestMarginPrice * 100) / 100;
        updates.total_price = Math.round(prices.financedPrice * 100) / 100;
        updates.factory_rebate_price = Math.round(prices.factoryRebatePrice * 100) / 100;
        updates.monthly_payment = calcMonthly36(updates.total_price);
        updates.monthly_payment_120 = calcMonthly120(updates.total_price);
      }

      const { error } = await supabase
        .from("equipment_matchups" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
      toast({ title: "Equipment matchup updated" });
    },
  });

  const recalculateAll = useMutation({
    mutationFn: async (
      onProgress?: (done: number, total: number) => void,
    ): Promise<{
      total: number;
      updated: number;
      skipped: number;
      failed: number;
      skippedRows: Array<{ id: string; brand: string; tier: string | null; reason: string }>;
    }> => {
      // Fetch all rows with a component_price (nothing to calc without it)
      const { data: rows, error: fetchErr } = await supabase
        .from("equipment_matchups" as any)
        .select("id, brand, tier, component_price, cooling_cap, seer2, condenser_model")
        .not("component_price", "is", null);
      if (fetchErr) throw fetchErr;

      const list = (rows || []) as unknown as Array<
        Pick<EquipmentMatchup, "id" | "brand" | "tier" | "component_price" | "cooling_cap" | "seer2"> & { condenser_model: string }
      >;
      const total = list.length;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const skippedRows: Array<{ id: string; brand: string; tier: string | null; reason: string }> = [];

      // Pre-fetch all formulas once (avoid N queries)
      const { data: formulasData } = await supabase
        .from("pricing_formulas" as any)
        .select("*");
      const formulas = (formulasData || []) as unknown as PricingFormula[];

      // STRICT resolver — NO global default fallback. Returns null if unresolvable.
      const resolveFormulaStrict = (brand: string, tier: string | null): PricingFormula | null => {
        // Step 1: exact brand + tier
        const exact = formulas.find((f) => f.brand === brand && f.tier === tier);
        if (exact) return exact;
        // Step 2: brand default (any tier)
        const brandDefault = formulas.find((f) => f.brand === brand && f.tier === null);
        if (brandDefault) return brandDefault;
        // Step 3: global tier (e.g. default + "Better")
        if (tier) {
          const globalTier = formulas.find((f) => f.brand === "default" && f.tier === tier);
          if (globalTier) return globalTier;
        }
        // Step 4 REMOVED — no silent global default fallback
        return null;
      };

      const BATCH = 50;
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = list.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (row) => {
            try {
              const tier = row.tier ?? null;
              // Skip if no tier assigned at all
              if (!tier || tier.trim() === "") {
                skipped++;
                skippedRows.push({ id: row.id, brand: row.brand, tier, reason: "No tier assigned" });
                return;
              }
              const formula = resolveFormulaStrict(row.brand, tier);
              if (!formula) {
                skipped++;
                skippedRows.push({
                  id: row.id,
                  brand: row.brand,
                  tier,
                  reason: `No formula for ${row.brand} · ${tier}`,
                });
                return;
              }
              const prices = calculatePrices(row.component_price as number, formula);
              const rebates = calculateCpsRebates(row.cooling_cap, row.seer2);
              const totalPrice = Math.round(prices.financedPrice * 100) / 100;
              const updates = {
                low_margin_price: Math.round(prices.lowestMarginPrice * 100) / 100,
                total_price: totalPrice,
                factory_rebate_price: Math.round(prices.factoryRebatePrice * 100) / 100,
                monthly_payment: calcMonthly36(totalPrice),
                monthly_payment_120: calcMonthly120(totalPrice),
                ...rebates,
              };
              const { error } = await supabase
                .from("equipment_matchups" as any)
                .update(updates as any)
                .eq("id", row.id);
              if (error) throw error;
              updated++;
            } catch (e) {
              console.error("Recalc failed for matchup", row.id, e);
              failed++;
            }
          }),
        );
        onProgress?.(Math.min(i + BATCH, total), total);
      }

      return { total, updated, skipped, failed, skippedRows };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
      // Toast is handled by caller via the results dialog — keep silent here.
    },
    onError: (e: any) => {
      toast({ title: "Recalc failed", description: e.message, variant: "destructive" });
    },
  });

  const deleteMatchup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("equipment_matchups" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
      toast({ title: "Equipment matchup deleted" });
    },
  });

  return {
    matchups: query.data || [],
    isLoading: query.isLoading,
    addMatchup,
    updateMatchup,
    deleteMatchup,
    recalculateAll,
  };
}
