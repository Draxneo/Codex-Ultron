import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Part {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  created_at: string;
  supply_house_numbers: SupplyHouseNumber[];
}

export interface SupplyHouseNumber {
  id: string;
  part_id: string;
  supply_house_id: string;
  part_number: string;
  unit_cost: number | null;
  notes: string | null;
  supply_house?: { id: string; name: string };
}

export function usePartsCatalog() {
  const queryClient = useQueryClient();

  const partsQuery = useQuery({
    queryKey: ["parts_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parts_catalog")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const supplyHouseNumbersQuery = useQuery({
    queryKey: ["part_supply_house_numbers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("part_supply_house_numbers")
        .select("*, supply_houses(id, name)");
      if (error) throw error;
      return data.map((row: any) => ({
        ...row,
        supply_house: row.supply_houses,
      }));
    },
  });

  const supplyHousesQuery = useQuery({
    queryKey: ["supply_houses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supply_houses")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const parts: Part[] = (partsQuery.data || []).map((p) => ({
    ...p,
    supply_house_numbers: (supplyHouseNumbersQuery.data || []).filter(
      (s: any) => s.part_id === p.id
    ),
  }));

  const addPart = useMutation({
    mutationFn: async (part: { name: string; description?: string; category?: string }) => {
      const { data, error } = await supabase.from("parts_catalog").insert(part).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts_catalog"] });
      toast({ title: "Part added" });
    },
  });

  const updatePart = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; category?: string }) => {
      const { error } = await supabase.from("parts_catalog").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts_catalog"] });
      toast({ title: "Part updated" });
    },
  });

  const deletePart = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parts_catalog").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts_catalog"] });
      toast({ title: "Part deleted" });
    },
  });

  const addSupplyHouseNumber = useMutation({
    mutationFn: async (row: { part_id: string; supply_house_id: string; part_number: string; unit_cost?: number }) => {
      const { error } = await supabase.from("part_supply_house_numbers").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part_supply_house_numbers"] });
      toast({ title: "Part number added" });
    },
  });

  const updateSupplyHouseNumber = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; part_number?: string; unit_cost?: number | null }) => {
      const { error } = await supabase.from("part_supply_house_numbers").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part_supply_house_numbers"] });
    },
  });

  const deleteSupplyHouseNumber = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("part_supply_house_numbers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part_supply_house_numbers"] });
    },
  });

  return {
    parts,
    supplyHouses: supplyHousesQuery.data || [],
    isLoading: partsQuery.isLoading || supplyHouseNumbersQuery.isLoading,
    isError: partsQuery.isError || supplyHouseNumbersQuery.isError,
    error: partsQuery.error || supplyHouseNumbersQuery.error,
    addPart,
    updatePart,
    deletePart,
    addSupplyHouseNumber,
    updateSupplyHouseNumber,
    deleteSupplyHouseNumber,
  };
}
