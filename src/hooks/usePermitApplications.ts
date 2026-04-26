import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PermitApplication {
  id: string;
  job_id: string;
  authority_id: string;
  status: string;
  confirmation_number: string | null;
  permit_number: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  inspection_scheduled_at: string | null;
  inspection_status: string | null;
  notes: string | null;
  automation_log: any[];
  created_at: string;
  updated_at: string;
}

export function usePermitApplication(jobId: string | undefined) {
  return useQuery({
    queryKey: ["permit_applications", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permit_applications" as any)
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as unknown as PermitApplication | null;
    },
  });
}

export function useUpsertPermitApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (app: Partial<PermitApplication> & { job_id: string; authority_id: string }) => {
      const payload = { ...app, updated_at: new Date().toISOString() };
      if (app.id) {
        const { error } = await supabase
          .from("permit_applications" as any)
          .update(payload as any)
          .eq("id", app.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("permit_applications" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["permit_applications", vars.job_id] });
      toast.success("Permit application saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
