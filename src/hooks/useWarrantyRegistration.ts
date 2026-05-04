import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWarrantyRegistration(jobId?: string) {
  return useQuery({
    queryKey: ["warranty_registration", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warranty_registrations" as any)
        .select("*")
        .eq("job_id", jobId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useMarkWarrantyRegistered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      confirmationNumber,
      notes,
    }: {
      jobId: string;
      confirmationNumber?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("warranty_registrations" as any)
        .upsert(
          {
            job_id: jobId,
            status: "registered",
            registered_at: new Date().toISOString(),
            confirmation_number: confirmationNumber || null,
            notes: notes || null,
          } as any,
          { onConflict: "job_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["warranty_registration", vars.jobId] });
    },
  });
}
