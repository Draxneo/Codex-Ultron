import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EMPLOYEE_SELECT } from "@/hooks/useEmployees";

/**
 * Pre-warms React Query cache on app boot with key data that rarely changes.
 * Fires once on mount — subsequent navigations hit cache instantly.
 */
export function usePreWarmCache() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const timers: number[] = [];
    const scheduleBackgroundWarmup = (callback: () => void, delayMs: number) => {
      const timer = window.setTimeout(callback, delayMs);
      timers.push(timer);
    };

    // Pre-fetch employees (30 min staleTime)
    queryClient.prefetchQuery({
      queryKey: ["employees"],
      queryFn: async () => {
        const { data, error } = await supabase.from("employees").select(EMPLOYEE_SELECT).order("name");
        if (error) throw error;
        return data;
      },
      staleTime: 30 * 60 * 1000,
    });

    // Pre-fetch company settings (30 min staleTime)
    queryClient.prefetchQuery({
      queryKey: ["company_settings"],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("company_settings" as any)
          .select("key, value");
        if (error) throw error;
        return data;
      },
      staleTime: 30 * 60 * 1000,
    });

    // Warm up heavier supporting data after the first screen has a chance to paint.
    scheduleBackgroundWarmup(() => {
      queryClient.prefetchQuery({
        queryKey: ["brand_profiles"],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("brand_profiles")
            .select("*")
            .eq("is_active", true)
            .order("brand_key");
          if (error) throw error;
          return data;
        },
        staleTime: 60 * 60 * 1000,
      });
    }, 1_000);

    scheduleBackgroundWarmup(() => {
      queryClient.prefetchQuery({
        queryKey: ["line_item_templates"],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("line_item_templates" as any)
            .select("*")
            .order("sort_order", { ascending: true });
          if (error) throw error;
          return data;
        },
        staleTime: 30 * 60 * 1000,
      });
    }, 1_500);

    scheduleBackgroundWarmup(() => {
      queryClient.prefetchQuery({
        queryKey: ["presentation_sections"],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("presentation_sections")
            .select("*")
            .eq("is_active", true)
            .order("sort_order");
          if (error) throw error;
          return data;
        },
        staleTime: 60 * 60 * 1000,
      });
    }, 2_000);

    scheduleBackgroundWarmup(() => {
      queryClient.prefetchQuery({
        queryKey: ["customer_names"],
        queryFn: async () => {
          const BATCH = 1000;
          const all: any[] = [];
          let from = 0;
          while (true) {
            const { data, error } = await supabase
              .from("customers")
              .select("id, first_name, last_name, company, phone, mobile_phone, address, city, state, zip")
              .order("last_name", { ascending: true })
              .range(from, from + BATCH - 1);
            if (error) throw error;
            all.push(...(data || []));
            if (!data || data.length < BATCH) break;
            from += BATCH;
          }
          return all;
        },
        staleTime: 120_000,
      });
    }, 2_500);

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [queryClient]);
}
