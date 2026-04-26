/**
 * useRepairReportData — Given a job_id, queries tech_form_responses,
 * tech_form_photos, and jobs to build data for RepairPresentationPreview.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RepairDiagnosisItem {
  item: string;
  price: number;
  customerDescription?: string;
  importance?: string;
  consequences?: string;
}

export interface RepairPhoto {
  url: string;
  label: string;
}

export interface RepairReportData {
  customerName: string;
  diagnosis: { necessary: RepairDiagnosisItem[]; recommended: RepairDiagnosisItem[]; deluxe: RepairDiagnosisItem[] };
  photos: RepairPhoto[];
  isLoading: boolean;
}

export function useRepairReportData(jobId: string | undefined) {
  return useQuery({
    queryKey: ["repair-report-data", jobId],
    enabled: !!jobId,
    queryFn: async (): Promise<Omit<RepairReportData, "isLoading">> => {
      // Fetch job + customer
      const { data: job } = await supabase
        .from("jobs")
        .select("id, customer_id, customers(first_name, last_name)")
        .eq("id", jobId!)
        .single();

      const customer = (job as any)?.customers;
      const customerName = customer ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim() : "Customer";

      // Try service_repair_items first (real pricing from quoting tool)
      const { data: repairItems } = await supabase
        .from("service_repair_items" as any)
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at");

      const items = (repairItems || []) as any[];

      if (items.length > 0) {
        // Build diagnosis from service_repair_items with real prices
        const diagnosis = { necessary: [] as RepairDiagnosisItem[], recommended: [] as RepairDiagnosisItem[], deluxe: [] as RepairDiagnosisItem[] };
        for (const item of items) {
          const tier = (item.severity || "recommended") as keyof typeof diagnosis;
          if (diagnosis[tier]) {
            diagnosis[tier].push({
              item: item.description,
              price: item.final_price || item.suggested_price || 0,
              customerDescription: item.customer_description || undefined,
              importance: item.importance || undefined,
              consequences: item.consequences || undefined,
            });
          }
        }

        // Fetch photos
        const photos = await fetchTechFormPhotos(jobId!);
        return { customerName, diagnosis, photos };
      }

      // Fallback: original tech form field logic
      const { data: techForms } = await supabase
        .from("tech_forms" as any)
        .select("id")
        .eq("job_id", jobId!) as any;
      const techFormId = (techForms as any[])?.[0]?.id;

      const { data: fieldsRaw } = await supabase
        .from("tech_form_fields" as any)
        .select("*")
        .eq("job_type", "service")
        .order("sort_order");
      const fields = (fieldsRaw || []) as any[];

      const responses = new Map<string, string>();
      if (techFormId) {
        const { data: respData } = await supabase
          .from("tech_form_responses" as any)
          .select("field_id, value")
          .eq("tech_form_id", techFormId);
        for (const r of (respData || []) as any[]) {
          responses.set(r.field_id, r.value);
        }
      }

      const diagnosis = { necessary: [] as RepairDiagnosisItem[], recommended: [] as RepairDiagnosisItem[], deluxe: [] as RepairDiagnosisItem[] };
      const diagFields = fields.filter((f: any) => f.step_group === "diagnosis");
      for (const field of diagFields) {
        const val = responses.get(field.id);
        if (val) {
          diagnosis.recommended.push({ item: `${field.label}: ${val}`, price: 0 });
        }
      }

      const photos = await fetchTechFormPhotos(jobId!);
      return { customerName, diagnosis, photos };
    },
  });
}

async function fetchTechFormPhotos(jobId: string): Promise<RepairPhoto[]> {
  const { data: techForms } = await supabase
    .from("tech_forms" as any)
    .select("id")
    .eq("job_id", jobId) as any;
  const techFormId = (techForms as any[])?.[0]?.id;

  const photos: RepairPhoto[] = [];
  if (techFormId) {
    const { data: photoData } = await supabase
      .from("tech_form_photos" as any)
      .select("file_path, photo_type")
      .eq("tech_form_id", techFormId);
    for (const p of (photoData || []) as any[]) {
      const { data: urlData } = supabase.storage
        .from("tech-form-photos")
        .getPublicUrl(p.file_path);
      photos.push({ url: urlData.publicUrl, label: p.photo_type || "Photo" });
    }
  }
  return photos;
}
