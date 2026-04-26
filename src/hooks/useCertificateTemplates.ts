import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface CertificateTemplate {
  id: string;
  type_key: string;
  display_name: string;
  subtitle_template: string;
  body_template: string;
  fields_schema: { label: string; variable: string }[];
  warranty_years: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCertificateTemplates() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["certificate_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificate_templates" as any)
        .select("*")
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as CertificateTemplate[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (template: Partial<CertificateTemplate> & { type_key: string; display_name: string }) => {
      const payload = { ...template, updated_at: new Date().toISOString() };
      if (template.id) {
        const { error } = await supabase
          .from("certificate_templates" as any)
          .update(payload as any)
          .eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("certificate_templates" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificate_templates"] });
      toast({ title: "Template saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("certificate_templates" as any)
        .update({ is_active: false, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificate_templates"] });
      toast({ title: "Template removed" });
    },
    onError: (e: any) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  return { ...query, templates: query.data || [], upsert, remove };
}

export function useCertificateTemplateByKey(typeKey: string | undefined) {
  return useQuery({
    queryKey: ["certificate_template", typeKey],
    enabled: !!typeKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificate_templates" as any)
        .select("*")
        .eq("type_key", typeKey!)
        .eq("is_active", true)
        .single();
      if (error) throw error;
      return data as unknown as CertificateTemplate;
    },
  });
}
