import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomerCertificate {
  id: string;
  customer_id: string;
  job_id: string | null;
  certificate_type: string;
  data_snapshot: any;
  token: string;
  generated_at: string;
  pdf_path: string | null;
}

export function useCertificatesForCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer_certificates", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_certificates" as any)
        .select("*")
        .eq("customer_id", customerId!)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CustomerCertificate[];
    },
  });
}

export function useCertificateByToken(token: string | undefined) {
  return useQuery({
    queryKey: ["certificate_by_token", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_certificates" as any)
        .select("*")
        .eq("token", token!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CustomerCertificate | null;
    },
  });
}

export function useGenerateCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      customer_id: string;
      job_id?: string;
      certificate_type: string;
      data_snapshot: any;
    }) => {
      const { data, error } = await supabase
        .from("customer_certificates" as any)
        .insert(params as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as CustomerCertificate;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["customer_certificates", vars.customer_id] });
    },
  });
}

/** Generate all post-install certificates (manufacturer warranty, labor warranty, no-lemon) */
export async function generateInstallCertificates(params: {
  customer_id: string;
  job_id: string;
  customerName: string;
  brand: string;
  model: string;
  serialNumber: string;
  installDate: string;
  confirmationNumber?: string;
  equipmentDescription: string;
}) {
  const certs = [
    {
      customer_id: params.customer_id,
      job_id: params.job_id,
      certificate_type: "manufacturer_warranty",
      data_snapshot: {
        customerName: params.customerName,
        brand: params.brand,
        model: params.model,
        serialNumber: params.serialNumber,
        installDate: params.installDate,
        warrantyYears: 10,
        confirmationNumber: params.confirmationNumber,
      },
    },
    {
      customer_id: params.customer_id,
      job_id: params.job_id,
      certificate_type: "labor_warranty",
      data_snapshot: {
        customerName: params.customerName,
        equipmentDescription: params.equipmentDescription,
        installDate: params.installDate,
        warrantyYears: 2,
      },
    },
    {
      customer_id: params.customer_id,
      job_id: params.job_id,
      certificate_type: "no_lemon",
      data_snapshot: {
        customerName: params.customerName,
        brand: params.brand,
        model: params.model,
        installDate: params.installDate,
      },
    },
  ];

  const { data, error } = await supabase
    .from("customer_certificates" as any)
    .insert(certs as any)
    .select("*");
  if (error) throw error;
  return (data || []) as unknown as CustomerCertificate[];
}
