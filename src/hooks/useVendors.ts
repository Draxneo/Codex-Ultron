import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Vendor {
  id: string;
  name: string;
  website_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  account_number: string | null;
  notes: string | null;
  is_active: boolean | null;
  ordering_url: string | null;
  text_support_phone: string | null;
  brand_affinity: string[] | null;
}

export interface VendorContact {
  id: string;
  supply_house_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  notes: string | null;
  is_primary: boolean | null;
}

export function useVendorList() {
  return useQuery({
    queryKey: ["supply_houses_full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supply_houses")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Vendor[];
    },
  });
}

export function useVendorContacts(vendorId?: string) {
  return useQuery({
    queryKey: ["vendor_contacts", vendorId],
    queryFn: async () => {
      let q = supabase.from("vendor_contacts").select("*").order("is_primary", { ascending: false });
      if (vendorId) q = q.eq("supply_house_id", vendorId);
      const { data, error } = await q;
      if (error) throw error;
      return data as VendorContact[];
    },
  });
}

export function useVendorEmails(_vendorId: string) {
  // emails table removed — always returns empty array
  return useQuery({
    queryKey: ["vendor_emails", _vendorId],
    enabled: false,
    queryFn: async () => [] as any[],
    initialData: [] as any[],
  });
}

export function useVendorSms(vendorId: string) {
  return useQuery({
    queryKey: ["vendor_sms", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("sms_log")
        .select("*") as any)
        .eq("related_vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useVendorCalls(vendorId: string) {
  return useQuery({
    queryKey: ["vendor_calls", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("call_log")
        .select("*") as any)
        .eq("related_vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useVendorOrders(vendorId: string) {
  return useQuery({
    queryKey: ["vendor_orders", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parts_orders")
        .select("*")
        .eq("supply_house_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useVendorLocations(vendorId?: string) {
  return useQuery({
    queryKey: ["vendor_locations", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supply_house_locations")
        .select("*")
        .eq("supply_house_id", vendorId!)
        .eq("is_active", true)
        .order("branch_name");
      if (error) throw error;
      return data || [];
    },
  });
}
