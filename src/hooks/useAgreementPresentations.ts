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
  customer_name?: string | null;
  company?: Record<string, string>;
}

export function useAgreementPresentationByToken(token: string | undefined) {
  return useQuery({
    queryKey: ["agreement_presentation_token", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_public_agreement_presentation" as any, { p_token: token! });
      if (error) throw error;
      if (!data) throw new Error("Presentation not found");
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

export async function recordAgreementView(token: string) {
  await supabase.rpc("track_public_agreement_presentation_view" as any, { p_token: token });
}

export async function markAgreementEnrolled(token: string) {
  const { error } = await supabase.rpc("submit_public_agreement_enrollment" as any, { p_token: token });
  if (error) throw error;
}
