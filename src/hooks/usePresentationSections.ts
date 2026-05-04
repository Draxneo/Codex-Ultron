import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PresentationSection {
  id: string;
  section_key: string;
  title: string;
  subtitle: string;
  body_html: string;
  items: any[];
  sort_order: number;
  is_active: boolean;
}

export function usePresentationSections() {
  const queryClient = useQueryClient();

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["presentation_sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presentation_sections")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        items: d.items || [],
      })) as PresentationSection[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const getSection = (key: string): PresentationSection | undefined => {
    return sections.find((s) => s.section_key === key);
  };

  const upsert = useMutation({
    mutationFn: async (section: Partial<PresentationSection> & { section_key: string }) => {
      const { error } = await supabase
        .from("presentation_sections")
        .upsert({ ...section, updated_at: new Date().toISOString() } as any, { onConflict: "section_key" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presentation_sections"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("presentation_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presentation_sections"] }),
  });

  return { sections, isLoading, getSection, upsert, remove };
}
