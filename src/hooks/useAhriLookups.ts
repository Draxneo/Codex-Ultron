import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type AhriLookup = {
  id: string;
  ahri_number: string;
  program_type: string | null;
  outdoor_brand: string | null;
  outdoor_series: string | null;
  outdoor_model: string | null;
  indoor_brand: string | null;
  indoor_model: string | null;
  furnace_model: string | null;
  cooling_cap_btuh: number | null;
  seer2: number | null;
  eer2: number | null;
  hspf2: number | null;
  model_status: string | null;
  refrigerant: string | null;
  energy_star: boolean | null;
  raw_json: any;
  certificate_path: string | null;
  linked_matchup_id: string | null;
  created_at: string;
};

export function useAhriLookups() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const lookupsQuery = useQuery({
    queryKey: ["ahri_lookups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ahri_lookups" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AhriLookup[];
    },
  });

  const lookupMutation = useMutation({
    mutationFn: async ({ ahri_number, system_type }: { ahri_number: string; system_type: string }) => {
      const { data, error } = await supabase.functions.invoke("ahri-lookup", {
        body: { ahri_number, system_type },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Lookup failed");
      return data.data as AhriLookup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ahri_lookups"] });
      toast({ title: "AHRI lookup complete" });
    },
    onError: (err: Error) => {
      toast({ title: "Lookup failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ahri_lookups" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ahri_lookups"] });
      toast({ title: "Lookup deleted" });
    },
  });

  return {
    lookups: lookupsQuery.data ?? [],
    isLoading: lookupsQuery.isLoading,
    lookup: lookupMutation.mutateAsync,
    isLookingUp: lookupMutation.isPending,
    deleteLookup: deleteMutation.mutate,
  };
}
