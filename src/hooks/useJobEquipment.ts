import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface JobEquipmentRecord {
  id: string;
  job_id: string;
  serial_number: string | null;
  model_number: string | null;
  brand: string | null;
  source: string;
  source_id: string | null;
  confidence: string;
  is_confirmed: boolean;
  conflicts: any[];
  created_at: string;
  updated_at: string;
}

export interface DataSourceStatus {
  hcp: boolean;
  invoice: boolean;
  data_plate: boolean;
  tech_form: boolean;
}

export interface EquipmentSummary {
  records: JobEquipmentRecord[];
  serialNumbers: string[];
  modelNumbers: string[];
  brands: string[];
  hasConflicts: boolean;
  conflicts: any[];
  sources: DataSourceStatus;
  invoiceTotal: number;
  ticketTotal: number;
  totalsDifference: number | null;
}

export function useJobEquipment(jobId: string) {
  return useQuery({
    queryKey: ["job_equipment", jobId],
    queryFn: async (): Promise<EquipmentSummary> => {
      // Fetch equipment records
      const { data: records, error } = await supabase
        .from("job_equipment")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const equip = (records || []) as JobEquipmentRecord[];

      // Deduplicate serials/models
      const serialSet = new Set<string>();
      const modelSet = new Set<string>();
      const brandSet = new Set<string>();
      let hasConflicts = false;
      const allConflicts: any[] = [];

      const sources: DataSourceStatus = {
        hcp: false,
        invoice: false,
        data_plate: false,
        tech_form: false,
      };

      for (const r of equip) {
        if (r.serial_number) serialSet.add(r.serial_number);
        if (r.model_number) modelSet.add(r.model_number);
        if (r.brand) brandSet.add(r.brand);
        if (r.source === "hcp_sync") sources.hcp = true;
        if (r.source === "invoice") sources.invoice = true;
        if (r.source === "data_plate") sources.data_plate = true;
        if (r.source === "tech_form") sources.tech_form = true;
        if (r.conflicts && Array.isArray(r.conflicts) && r.conflicts.length > 0) {
          hasConflicts = true;
          allConflicts.push(...r.conflicts);
        }
      }

      // Cross-validate invoice vs supply ticket totals
      const { data: invoices } = await supabase
        .from("job_invoices")
        .select("total_amount")
        .eq("job_id", jobId);

      const { data: forms } = await supabase
        .from("tech_forms")
        .select("id")
        .eq("job_id", jobId);

      let ticketTotal = 0;
      if (forms && forms.length > 0) {
        const formIds = forms.map(f => f.id);
        const { data: tickets } = await supabase
          .from("tech_form_photos")
          .select("extracted_total, photo_type")
          .in("tech_form_id", formIds);
        (tickets || []).forEach((t: any) => {
          const pt = (t.photo_type || "").toLowerCase();
          if ((pt.includes("supply") || pt.includes("ticket")) && t.extracted_total) {
            ticketTotal += Number(t.extracted_total);
          }
        });
      }

      const invoiceTotal = (invoices || []).reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
      const totalsDifference = invoiceTotal > 0 && ticketTotal > 0
        ? Math.abs(invoiceTotal - ticketTotal)
        : null;

      return {
        records: equip,
        serialNumbers: Array.from(serialSet),
        modelNumbers: Array.from(modelSet),
        brands: Array.from(brandSet),
        hasConflicts,
        conflicts: allConflicts,
        sources,
        invoiceTotal,
        ticketTotal,
        totalsDifference,
      };
    },
    enabled: !!jobId,
  });
}
