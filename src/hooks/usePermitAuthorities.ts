import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PermitAuthority {
  id: string;
  name: string;
  jurisdiction_type: string;
  permit_portal_url: string | null;
  inspection_url: string | null;
  inspection_phone: string | null;
  contact_email: string | null;
  zip_codes: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function usePermitAuthorities() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["permit_authorities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permit_authorities" as any)
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as PermitAuthority[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (authority: Partial<PermitAuthority> & { name: string }) => {
      const payload = { ...authority, updated_at: new Date().toISOString() };
      if (authority.id) {
        const { error } = await supabase
          .from("permit_authorities" as any)
          .update(payload as any)
          .eq("id", authority.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("permit_authorities" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permit_authorities"] });
      toast.success("Authority saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("permit_authorities" as any)
        .update({ is_active: false, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permit_authorities"] });
      toast.success("Authority removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { ...query, authorities: query.data || [], upsert, remove };
}

/** Look up the permit authority for a given zip code */
export function useAuthorityForZip(zip: string | null | undefined) {
  const { authorities } = usePermitAuthorities();
  if (!zip || !authorities.length) return null;
  const clean = zip.trim().slice(0, 5);
  // Exact zip match first
  const match = authorities.find((a) => a.zip_codes.includes(clean));
  if (match) return match;
  // Fallback to county (empty zip_codes = catch-all)
  const county = authorities.find(
    (a) => a.jurisdiction_type === "county" && a.zip_codes.length === 0
  );
  return county || null;
}
