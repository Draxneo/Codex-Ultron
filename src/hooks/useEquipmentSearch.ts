import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

interface Filters {
  brand?: string;
  systemType?: string;
  tier?: string;
  application?: string;
  tonnage?: number;
}

export function useEquipmentSearch(query: string, filters?: Filters) {
  const [results, setResults] = useState<EquipmentMatchup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hasFilter = !!filters?.brand || !!filters?.systemType || !!filters?.tier || !!filters?.application || !!filters?.tonnage;
    if (!query && !hasFilter) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("equipment_matchups" as any)
          .select("id, brand, system_type, tier, application, condenser_model, furnace_model, coil_model, tonnage, seer2, eer2, hspf2, cooling_cap, afue, ahri_number, component_price, total_price, factory_rebate_price, monthly_payment, cps_tonnage, early_rebate, burnout_rebate, notes, low_margin_price, cps_rebate_tier, features_benefits, heat_kit, ahri_certificate_path, image_url, created_at")
          .order("brand")
          .order("tonnage")
          .order("tier")
          .limit(500);

        if (filters?.brand) q = q.eq("brand", filters.brand);
        if (filters?.systemType) q = q.eq("system_type", filters.systemType);
        if (filters?.tier) q = q.eq("tier", filters.tier);
        if (filters?.application) q = q.eq("application", filters.application);
        if (filters?.tonnage) q = q.eq("tonnage", filters.tonnage);
        if (query) {
          q = q.or(`condenser_model.ilike.%${query}%,furnace_model.ilike.%${query}%,coil_model.ilike.%${query}%,tier.ilike.%${query}%,ahri_number.ilike.%${query}%`);
        }

        const { data } = await q;
        setResults((data || []) as unknown as EquipmentMatchup[]);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, filters?.brand, filters?.systemType, filters?.tier, filters?.application, filters?.tonnage]);

  return { results, loading };
}
