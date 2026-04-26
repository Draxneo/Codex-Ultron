import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AgreementPresentation {
  id: string;
  customer_id: string;
  token: string;
  plan_options: any;
  created_at: string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  enrolled_at: string | null;
}

export function useAgreementPresentationByToken(token: string | undefined) {
  return useQuery({
    queryKey: ["agreement_presentation_token", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreement_presentations" as any)
        .select("*")
        .eq("token", token!)
        .single();
      if (error) throw error;
      return data as unknown as AgreementPresentation;
    },
  });
}

export function useCreateAgreementPresentation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      customer_id: string;
      plan_options: any;
    }) => {
      const { data, error } = await supabase
        .from("agreement_presentations" as any)
        .insert(params as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as AgreementPresentation;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["agreement_presentations"] });
    },
  });
}

export async function recordAgreementView(id: string, currentCount: number, isFirst: boolean) {
  const updates: any = {
    last_viewed_at: new Date().toISOString(),
    view_count: currentCount + 1,
  };
  if (isFirst) updates.first_viewed_at = new Date().toISOString();
  await supabase
    .from("agreement_presentations" as any)
    .update(updates)
    .eq("id", id);
}

export async function markAgreementEnrolled(id: string) {
  await supabase
    .from("agreement_presentations" as any)
    .update({ enrolled_at: new Date().toISOString() } as any)
    .eq("id", id);
}
