import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface PricingFormula {
  id: string;
  brand: string;
  tier: string | null;
  materials_fee: number;
  tax_rate: number;
  labor_fee: number;
  profit_fee: number;
  finance_rate: number;
  cash_rebate: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_FORMULA: Omit<PricingFormula, "id" | "brand" | "tier" | "created_at" | "updated_at"> = {
  materials_fee: 300,
  tax_rate: 8.25,
  labor_fee: 1000,
  profit_fee: 4000,
  finance_rate: 16,
  cash_rebate: 0,
};

export interface PriceBreakdown {
  equipmentCost: number;
  subtotalBeforeTax: number;
  taxAmount: number;
  lowestMarginPrice: number;
  financedPrice: number;
  factoryRebatePrice: number;
}

export function calculatePrices(componentPrice: number, formula: typeof DEFAULT_FORMULA): PriceBreakdown {
  const equipmentCost = componentPrice;
  const subtotalBeforeTax = equipmentCost + formula.materials_fee + formula.labor_fee + formula.profit_fee;
  const taxAmount = subtotalBeforeTax * (formula.tax_rate / 100);
  const lowestMarginPrice = subtotalBeforeTax + taxAmount;
  const financedPrice = lowestMarginPrice * (1 + formula.finance_rate / 100);
  const factoryRebatePrice = financedPrice - formula.cash_rebate;
  return { equipmentCost, subtotalBeforeTax, taxAmount, lowestMarginPrice, financedPrice, factoryRebatePrice };
}

export function usePricingFormulas() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pricing_formulas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_formulas" as any)
        .select("*")
        .order("brand")
        .order("tier");
      if (error) throw error;
      return data as unknown as PricingFormula[];
    },
  });

  const upsertFormula = useMutation({
    mutationFn: async (formula: Omit<PricingFormula, "id" | "created_at" | "updated_at">) => {
      // Find existing row by brand + tier (handling null tier)
      let findQuery = supabase
        .from("pricing_formulas" as any)
        .select("id")
        .eq("brand", formula.brand);
      
      if (formula.tier === null) {
        findQuery = findQuery.is("tier", null);
      } else {
        findQuery = findQuery.eq("tier", formula.tier);
      }

      const { data: existing } = await findQuery.maybeSingle();

      const payload = { ...formula, updated_at: new Date().toISOString() } as any;

      if (existing) {
        // Update existing row
        const { data, error } = await supabase
          .from("pricing_formulas" as any)
          .update(payload)
          .eq("id", (existing as any).id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // Insert new row
        const { data, error } = await supabase
          .from("pricing_formulas" as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_formulas"] });
    },
  });

  const getFormula = (brand: string, tier: string | null): typeof DEFAULT_FORMULA => {
    const formulas = query.data || [];
    // Try exact brand+tier match
    const exact = formulas.find((f) => f.brand === brand && f.tier === tier);
    if (exact) return exact;
    // Fallback to brand default (tier=null)
    const brandDefault = formulas.find((f) => f.brand === brand && f.tier === null);
    if (brandDefault) return brandDefault;
    // Fallback to global default for this tier (brand="default")
    const globalTierDefault = formulas.find((f) => f.brand === "default" && f.tier === tier);
    if (globalTierDefault) return globalTierDefault;
    // Final fallback to global default (brand="default", tier=null)
    const globalDefault = formulas.find((f) => f.brand === "default" && f.tier === null);
    if (globalDefault) return globalDefault;
    return DEFAULT_FORMULA;
  };

  return {
    formulas: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    upsertFormula,
    getFormula,
    calculatePrices,
  };
}
