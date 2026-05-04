import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ApprovedEstimate {
  selectedTier: string | null;
  selectedAddons: any[] | null;
  paymentPreference: string | null;
  presentationToken: string | null;
  respondedAt: string | null;
  priceBlock?: {
    total_price: number | null;
    factory_rebate_price: number | null;
    monthly_payment: number | null;
    early_rebate: number | null;
    burnout_rebate: number | null;
    condenser_model: string | null;
    furnace_model: string | null;
    coil_model: string | null;
    seer2: number | null;
    tonnage: number | null;
  } | null;
}

export interface EquipmentDocsData {
  oldEquipment: {
    id: string;
    brand: string | null;
    model_number: string | null;
    serial_number: string | null;
    equipment_type: string;
    install_date: string | null;
  }[];
  newEquipment: {
    id: string;
    brand: string | null;
    model_number: string | null;
    serial_number: string | null;
    source: string;
  }[];
  ahri: {
    ahri_number: string;
    seer2: number | null;
    hspf2: number | null;
    eer2: number | null;
    certificate_path: string | null;
    certificateUrl: string | null;
    outdoor_model: string | null;
    indoor_model: string | null;
    furnace_model: string | null;
    energy_star: boolean | null;
  }[];
  photos: {
    id: string;
    photoType: string;
    url: string;
  }[];
  certificates: {
    id: string;
    certificate_type: string;
    token: string;
  }[];
}

export interface CpsRebateData {
  qualifies: boolean;
  tierName: string;
  earlyRebate: number;
  burnoutRebate: number;
  seer2: number;
  eer2: number;
  hspf2: number | null;
  ahriNumber: string;
  tonnage: number | null;
  condenserModel: string | null;
  coilModel: string | null;
  furnaceModel: string | null;
  rebateUrl: string;
}

export interface PublicInvoiceData {
  invoice: any;
  job: any;
  companySettings: Record<string, string>;
  approvedEstimate?: ApprovedEstimate | null;
  equipmentDocs?: EquipmentDocsData | null;
  cpsRebate?: CpsRebateData | null;
}

export function usePublicInvoice(token?: string) {
  return useQuery<PublicInvoiceData>({
    queryKey: ["public_invoice", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("invoice-public", {
        body: { token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as PublicInvoiceData;
    },
  });
}
