import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type QuickLinkData = {
  id: string;
  href: string;
  label: string;
  sub: string;
  iconName: string;
  category: string;
  sort_order: number;
};

type DbRow = {
  id: string;
  href: string;
  label: string;
  sub: string;
  icon_name: string;
  category: string;
  sort_order: number;
};

function rowToLink(r: DbRow): QuickLinkData {
  return { id: r.id, href: r.href, label: r.label, sub: r.sub, iconName: r.icon_name, category: r.category, sort_order: r.sort_order };
}

export function useQuickLinks() {
  const qc = useQueryClient();

  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: ["quick-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_links")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data as DbRow[]).map(rowToLink);
    },
  });

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ["quick-link-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_link_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data.map((r: any) => r.name as string);
    },
  });

  const addLink = useMutation({
    mutationFn: async (link: Omit<QuickLinkData, "id" | "sort_order">) => {
      const { error } = await supabase.from("quick_links").insert({
        href: link.href,
        label: link.label,
        sub: link.sub,
        icon_name: link.iconName,
        category: link.category,
        sort_order: links.length,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-links"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-links"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderLinks = useMutation({
    mutationFn: async (ordered: QuickLinkData[]) => {
      // Batch update sort_order + category
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase
          .from("quick_links")
          .update({ sort_order: i, category: ordered[i].category })
          .eq("id", ordered[i].id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-links"] }),
  });

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("quick_link_categories").insert({
        name,
        sort_order: categories.length,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-link-categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const renameCategory = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      // Update category table
      const { error: catErr } = await supabase
        .from("quick_link_categories")
        .update({ name: newName })
        .eq("name", oldName);
      if (catErr) throw catErr;
      // Update all links in this category
      const { error: linkErr } = await supabase
        .from("quick_links")
        .update({ category: newName })
        .eq("category", oldName);
      if (linkErr) throw linkErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-links"] });
      qc.invalidateQueries({ queryKey: ["quick-link-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from("quick_link_categories")
        .delete()
        .eq("name", name);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-link-categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    links,
    categories,
    isLoading: linksLoading || catsLoading,
    addLink,
    deleteLink,
    reorderLinks,
    addCategory,
    renameCategory,
    deleteCategory,
  };
}
