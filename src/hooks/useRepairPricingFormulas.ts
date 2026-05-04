import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RepairPricingFormula {
  id: string;
  category: string; // 'default' for global
  flat_rate_multiplier: number;
  member_discount: number;
  margin_floor: number;
  created_at: string;
  updated_at: string;
}

export interface RepairCatalogRow {
  id: string;
  name: string;
  category: string;
  base_price: number | null;
  parts_cost: number | null;
  member_price: number | null;
  manual_price_override: boolean | null;
  is_active: boolean;
}

export interface MarginHealthItem {
  id: string;
  name: string;
  category: string;
  base_price: number;
  parts_cost: number;
  margin: number; // 0–1
  floor: number; // 0–1
}

export interface MarginHealth {
  total: number;
  avgMargin: number; // 0–1
  okCount: number;
  belowFloorCount: number;
  belowFloor: MarginHealthItem[];
  byCategory: Record<string, { total: number; ok: number; below: number }>;
}

const round49 = (n: number) => Math.max(0, Math.floor(n) + 0.49);

export function useRepairPricingFormulas() {
  const qc = useQueryClient();

  const formulasQuery = useQuery({
    queryKey: ["repair_pricing_formulas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_pricing_formulas" as any)
        .select("*")
        .order("category");
      if (error) throw error;
      return data as unknown as RepairPricingFormula[];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["repair_catalog_for_pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_catalog")
        .select("id, name, category, base_price, parts_cost, member_price, manual_price_override, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as unknown as RepairCatalogRow[];
    },
  });

  const formulas = formulasQuery.data || [];
  const items = itemsQuery.data || [];

  const DEFAULT: Omit<RepairPricingFormula, "id" | "category" | "created_at" | "updated_at"> = {
    flat_rate_multiplier: 1.0,
    member_discount: 0.15,
    margin_floor: 0.65,
  };

  const getFormula = (category: string) => {
    const cat = formulas.find((f) => f.category === category);
    const def = formulas.find((f) => f.category === "default");
    return {
      flat_rate_multiplier: cat?.flat_rate_multiplier ?? def?.flat_rate_multiplier ?? DEFAULT.flat_rate_multiplier,
      member_discount: cat?.member_discount ?? def?.member_discount ?? DEFAULT.member_discount,
      margin_floor: cat?.margin_floor ?? def?.margin_floor ?? DEFAULT.margin_floor,
    };
  };

  const upsertFormula = useMutation({
    mutationFn: async (f: Omit<RepairPricingFormula, "id" | "created_at" | "updated_at">) => {
      const { data: existing } = await supabase
        .from("repair_pricing_formulas" as any)
        .select("id")
        .eq("category", f.category)
        .maybeSingle();

      const payload: any = { ...f, updated_at: new Date().toISOString() };
      if (existing) {
        const { error } = await supabase
          .from("repair_pricing_formulas" as any)
          .update(payload)
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("repair_pricing_formulas" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repair_pricing_formulas"] }),
  });

  const deleteCategoryOverride = useMutation({
    mutationFn: async (category: string) => {
      if (category === "default") return;
      const { error } = await supabase
        .from("repair_pricing_formulas" as any)
        .delete()
        .eq("category", category);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repair_pricing_formulas"] }),
  });

  /**
   * Recalculate all repair prices using the current formulas.
   * For each item: new_base = round_to_49(current_base × multiplier_for_its_category)
   *                new_member = round_to_49(new_base × (1 − member_discount))
   * Skips items with manual_price_override = true.
   */
  const recalculateAll = async (
    onProgress?: (done: number, total: number) => void
  ): Promise<{ updated: number; skipped: number; total: number }> => {
    const eligible = items.filter((i) => !i.manual_price_override && Number(i.base_price ?? 0) > 0);
    const skipped = items.length - eligible.length;
    let done = 0;

    for (const it of eligible) {
      const f = getFormula(it.category);
      const newBase = round49(Number(it.base_price) * f.flat_rate_multiplier);
      const newMember = round49(newBase * (1 - f.member_discount));
      await supabase
        .from("repair_catalog")
        .update({ base_price: newBase, member_price: newMember } as any)
        .eq("id", it.id);
      done += 1;
      onProgress?.(done, eligible.length);
    }

    // Stamp last_recalc_at to company_settings
    await supabase
      .from("company_settings")
      .upsert(
        { key: "repair_pricing_last_recalc_at", value: new Date().toISOString() } as any,
        { onConflict: "key" } as any
      );

    qc.invalidateQueries({ queryKey: ["repair-catalog"] });
    qc.invalidateQueries({ queryKey: ["repair_catalog_for_pricing"] });
    return { updated: done, skipped, total: items.length };
  };

  /**
   * Apply a one-shot percentage bump only to items currently flagged below floor.
   * E.g. bumpPct = 0.10 → +10% on flagged items.
   */
  const bumpFlagged = async (bumpPct: number): Promise<number> => {
    const flagged = items.filter((it) => {
      if (it.manual_price_override) return false;
      const base = Number(it.base_price ?? 0);
      const parts = Number(it.parts_cost ?? 0);
      if (base <= 0) return false;
      const margin = (base - parts) / base;
      const floor = getFormula(it.category).margin_floor;
      return margin < floor;
    });
    for (const it of flagged) {
      const f = getFormula(it.category);
      const newBase = round49(Number(it.base_price) * (1 + bumpPct));
      const newMember = round49(newBase * (1 - f.member_discount));
      await supabase
        .from("repair_catalog")
        .update({ base_price: newBase, member_price: newMember } as any)
        .eq("id", it.id);
    }
    qc.invalidateQueries({ queryKey: ["repair-catalog"] });
    qc.invalidateQueries({ queryKey: ["repair_catalog_for_pricing"] });
    return flagged.length;
  };

  const getMarginHealth = (): MarginHealth => {
    const byCategory: MarginHealth["byCategory"] = {};
    const belowFloor: MarginHealthItem[] = [];
    let marginSum = 0;
    let counted = 0;

    for (const it of items) {
      const base = Number(it.base_price ?? 0);
      const parts = Number(it.parts_cost ?? 0);
      if (base <= 0) continue;
      const margin = (base - parts) / base;
      const floor = getFormula(it.category).margin_floor;
      marginSum += margin;
      counted += 1;
      if (!byCategory[it.category]) byCategory[it.category] = { total: 0, ok: 0, below: 0 };
      byCategory[it.category].total += 1;
      if (margin < floor) {
        byCategory[it.category].below += 1;
        belowFloor.push({
          id: it.id,
          name: it.name,
          category: it.category,
          base_price: base,
          parts_cost: parts,
          margin,
          floor,
        });
      } else {
        byCategory[it.category].ok += 1;
      }
    }

    belowFloor.sort((a, b) => a.margin - b.margin);

    return {
      total: counted,
      avgMargin: counted > 0 ? marginSum / counted : 0,
      okCount: counted - belowFloor.length,
      belowFloorCount: belowFloor.length,
      belowFloor,
      byCategory,
    };
  };

  return {
    formulas,
    items,
    isLoading: formulasQuery.isLoading || itemsQuery.isLoading,
    getFormula,
    upsertFormula,
    deleteCategoryOverride,
    recalculateAll,
    bumpFlagged,
    getMarginHealth,
    DEFAULT,
  };
}
