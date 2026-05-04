import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useJobInvoices(jobId?: string) {
  return useQuery({
    queryKey: ["job_invoices", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_invoices")
        .select("*, supply_houses(name)")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSupplyHouses() {
  return useQuery({
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
}

export function useUploadInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, file, uploadedBy }: { jobId: string; file: File; uploadedBy?: string }) => {
      // Upload file to storage
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${jobId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("invoices").upload(filePath, file);
      if (uploadErr) throw uploadErr;

      // Get public URL
      const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(filePath);
      const imageUrl = urlData.publicUrl;

      // Create invoice record
      const { data: invoice, error: insertErr } = await supabase
        .from("job_invoices")
        .insert({
          job_id: jobId,
          file_path: filePath,
          uploaded_by: uploadedBy || "Unknown",
          extraction_status: "pending",
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      // Trigger AI extraction
      const { error: fnErr } = await supabase.functions.invoke("extract-invoice", {
        body: { invoice_id: invoice.id, image_url: imageUrl },
      });
      if (fnErr) console.error("Extraction invoke error:", fnErr);

      return invoice;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["job_invoices", vars.jobId] });
    },
  });
}

export function usePartsCatalog() {
  return useQuery({
    queryKey: ["parts_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parts_catalog")
        .select("*, part_supply_house_numbers(*, supply_houses(name))")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function getInvoiceUrl(filePath: string) {
  const { data } = supabase.storage.from("invoices").getPublicUrl(filePath);
  return data.publicUrl;
}
