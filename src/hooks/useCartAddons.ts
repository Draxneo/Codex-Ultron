import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CartAddonRule {
  id: string;
  trigger_kind: "equipment" | "repair" | "part" | "any";
  trigger_source_id: string | null;
  suggestion_kind: "equipment" | "repair" | "part" | "custom";
  suggestion_source_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  unit_price: number;
  badge: string | null;
  sort_order: number;
  is_active: boolean;
}

/**
 * Returns add-on suggestions matching what's currently in the cart.
 * Logic: pull all active rules whose trigger_kind matches a cart item kind
 * (or is "any"), and exclude items already present by name.
 */
export function useCartAddons(cartItemKinds: string[], cartItemNames: string[]) {
  const distinctKinds = Array.from(new Set([...cartItemKinds, "any"]));

  const { data, isLoading } = useQuery({
    queryKey: ["cart_addon_rules", distinctKinds.sort().join(",")],
    enabled: distinctKinds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cart_addon_rules")
        .select("*")
        .eq("is_active", true)
        .in("trigger_kind", distinctKinds)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as CartAddonRule[];
    },
  });

  const lowered = new Set(cartItemNames.map((n) => n.toLowerCase().trim()));
  const suggestions = (data || []).filter((r) => !lowered.has(r.name.toLowerCase().trim()));

  return { suggestions, isLoading };
}

export interface CartDiscount {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_total: number;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  is_active: boolean;
}

export type ValidateDiscountResult =
  | { ok: true; discount: CartDiscount; amount: number; reason?: undefined }
  | { ok: false; reason: string; discount?: undefined; amount?: undefined };

export async function validateDiscountCode(code: string, subtotal: number): Promise<ValidateDiscountResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, reason: "Enter a code" };

  const { data, error } = await (supabase as any)
    .from("cart_discounts")
    .select("*")
    .eq("code", trimmed)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: "Code not found" };

  const d = data as CartDiscount;
  if (d.expires_at && new Date(d.expires_at) < new Date()) return { ok: false, reason: "Code expired" };
  if (d.max_uses && d.use_count >= d.max_uses) return { ok: false, reason: "Code fully redeemed" };
  if (subtotal < Number(d.min_total)) return { ok: false, reason: `Requires $${Number(d.min_total).toFixed(2)} minimum` };

  const amount =
    d.discount_type === "percent"
      ? Math.round((subtotal * Number(d.discount_value)) / 100 * 100) / 100
      : Math.min(Number(d.discount_value), subtotal);

  return { ok: true, discount: d, amount };
}
