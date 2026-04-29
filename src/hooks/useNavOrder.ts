import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Default nav order by route path
const DEFAULT_ORDER = [
  "/", "/phone", "/sms", "/customers", "/quick-quote", "/catalog", "/pay", "/copilot", "/admin",
];

function migrateLegacyOrder(order: string[]) {
  const migrated: string[] = [];
  for (const path of order) {
    if (path === "/inbox") {
      migrated.push("/phone", "/sms");
    } else {
      migrated.push(path);
    }
  }
  return Array.from(new Set(migrated));
}

export function useNavOrder() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["nav_order"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", "nav_order")
        .maybeSingle();
      if (error) throw error;
      let saved: string[] = DEFAULT_ORDER;
      if (data?.value) {
        try {
          saved = JSON.parse(data.value) as string[];
        } catch {
          saved = DEFAULT_ORDER;
        }
      }
      // Move old combined communications nav into the split Phone/SMS routes.
      saved = migrateLegacyOrder(saved).filter((p) => DEFAULT_ORDER.includes(p));
      // Merge in any new routes not yet in the saved order
      const missing = DEFAULT_ORDER.filter((p) => !saved.includes(p));
      return missing.length > 0 ? [...saved, ...missing] : saved;
    },
  });

  const saveOrder = useMutation({
    mutationFn: async (order: string[]) => {
      const value = JSON.stringify(order);
      // Upsert: try update first, insert if missing
      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .eq("key", "nav_order")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("company_settings")
          .update({ value, updated_at: new Date().toISOString() } as any)
          .eq("key", "nav_order");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert({ key: "nav_order", value } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nav_order"] });
      toast({ title: "Navigation order saved" });
    },
  });

  return {
    order: query.data || DEFAULT_ORDER,
    isLoading: query.isLoading,
    saveOrder,
  };
}
