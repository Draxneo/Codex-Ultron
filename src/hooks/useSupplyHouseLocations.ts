import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface SupplyHouseLocation {
  id: string;
  supply_house_id: string;
  branch_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  fax: string | null;
  hours: string | null;
  website_url: string | null;
  latitude: number | null;
  longitude: number | null;
  account_number: string | null;
  rep_name: string | null;
  rep_phone: string | null;
  is_active: boolean;
  created_at: string;
  supply_house?: { id: string; name: string };
}

export interface SearchResult {
  supply_house_id: string;
  supply_house_name: string;
  branch_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  hours: string | null;
  website_url: string | null;
  source_url: string | null;
}

export function useSupplyHouseLocations() {
  const queryClient = useQueryClient();
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const locationsQuery = useQuery({
    queryKey: ["supply_house_locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supply_house_locations")
        .select("*, supply_houses(id, name, ordering_url, brand_affinity)")
        .eq("is_active", true)
        .order("branch_name");
      if (error) throw error;
      return (data as any[]).map((row) => ({
        ...row,
        supply_house: row.supply_houses,
      })) as SupplyHouseLocation[];
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

  const searchLocations = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("scrape-supply-locations");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const results = data?.results || [];
      setSearchResults(results);
      toast({
        title: "Search complete",
        description: `Found ${results.length} potential locations. Review and save the ones you want.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    },
  });

  const saveLocation = useMutation({
    mutationFn: async (result: SearchResult) => {
      const { error } = await supabase.from("supply_house_locations").upsert(
        {
          supply_house_id: result.supply_house_id,
          branch_name: result.branch_name,
          address: result.address,
          city: result.city,
          state: result.state,
          zip: result.zip,
          phone: result.phone,
          hours: result.hours,
          website_url: result.website_url,
        },
        { onConflict: "supply_house_id,branch_name", ignoreDuplicates: false }
      );
      if (error) throw error;
    },
    onSuccess: (_data, result) => {
      queryClient.invalidateQueries({ queryKey: ["supply_house_locations"] });
      setSearchResults((prev) => prev.filter((r) => r !== result));
      toast({ title: "Saved", description: `${result.branch_name} added` });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const updateLocation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<SupplyHouseLocation, "account_number" | "rep_name" | "rep_phone">> }) => {
      const { error } = await supabase
        .from("supply_house_locations")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply_house_locations"] });
      toast({ title: "Updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const dismissResult = (result: SearchResult) => {
    setSearchResults((prev) => prev.filter((r) => r !== result));
  };

  const createSupplyHouse = useMutation({
    mutationFn: async (house: { name: string; website_url?: string; ordering_url?: string; brand_affinity?: string[]; contact_name?: string; contact_phone?: string; contact_email?: string }) => {
      const { error } = await supabase.from("supply_houses").insert(house as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply_houses"] });
      toast({ title: "Supply house created" });
    },
    onError: (err: any) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  const updateSupplyHouse = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("supply_houses").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply_houses"] });
      toast({ title: "Supply house updated" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  return {
    locations: locationsQuery.data || [],
    supplyHouses: supplyHousesQuery.data || [],
    isLoading: locationsQuery.isLoading,
    searchLocations,
    saveLocation,
    updateLocation,
    createSupplyHouse,
    updateSupplyHouse,
    searchResults,
    dismissResult,
  };
}
