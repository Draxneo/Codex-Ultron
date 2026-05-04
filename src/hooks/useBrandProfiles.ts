import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BrandProfile {
  id: string;
  brand_key: string;
  display_name: string;
  headline: string;
  subhead: string;
  eyebrow: string;
  title: string;
  body_1: string;
  body_2: string;
  badges: { icon: string; text: string }[];
  refrigerant: { name: string; detail: string };
  logo_url: string;
  accent_color: string;
  accent_bg: string;
  pill_bg: string;
  gradient: string;
  is_active: boolean;
}

export function useBrandProfiles() {
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["brand_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("*")
        .eq("is_active", true)
        .order("brand_key");
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        badges: d.badges || [],
        refrigerant: d.refrigerant || { name: "", detail: "" },
      })) as BrandProfile[];
    },
    staleTime: 60 * 60 * 1000, // 1 hour — brand profiles are essentially static
  });

  const getProfile = (brandKey: string): BrandProfile | undefined => {
    return profiles.find((p) => p.brand_key === brandKey);
  };

  const upsert = useMutation({
    mutationFn: async (profile: Partial<BrandProfile> & { brand_key: string }) => {
      const { error } = await supabase
        .from("brand_profiles")
        .upsert({ ...profile, updated_at: new Date().toISOString() } as any, { onConflict: "brand_key" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brand_profiles"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brand_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brand_profiles"] }),
  });

  return { profiles, isLoading, getProfile, upsert, remove };
}
