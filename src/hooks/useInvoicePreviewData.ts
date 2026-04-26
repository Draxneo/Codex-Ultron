/**
 * useInvoicePreviewData — Given an invoiceId or jobId, fetches the invoice,
 * line items, customer, and company settings for InvoicePreview.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EquipmentDocsData, CpsRebateData } from "@/hooks/usePublicInvoice";

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
}

export interface InvoicePreviewData {
  invoice_number: string;
  created_at: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  paid_at: string | null;
  payment_method: string | null;
  items: InvoiceLineItem[];
  customer: {
    first_name: string | null;
    last_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    email: string | null;
    phone: string | null;
  };
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  companyLicense: string;
  equipmentDocs?: EquipmentDocsData | null;
  cpsRebate?: CpsRebateData | null;
}

export function useInvoicePreviewData(opts?: { invoiceId?: string; jobId?: string }) {
  const invoiceId = opts?.invoiceId;
  const jobId = opts?.jobId;

  return useQuery({
    queryKey: ["invoice-preview-data", invoiceId, jobId],
    enabled: !!(invoiceId || jobId),
    queryFn: async (): Promise<InvoicePreviewData> => {
      // Fetch invoice
      let invoiceQuery = supabase
        .from("customer_invoices")
        .select("*, customer_invoice_items(*)")
        .order("sort_order", { referencedTable: "customer_invoice_items" });

      if (invoiceId) {
        invoiceQuery = invoiceQuery.eq("id", invoiceId);
      } else if (jobId) {
        invoiceQuery = invoiceQuery.eq("job_id", jobId);
      }

      const { data: invoices, error: invErr } = await invoiceQuery.limit(1);
      if (invErr) throw invErr;
      const invoice = invoices?.[0];
      if (!invoice) throw new Error("Invoice not found");

      // Get the job to find the customer
      const { data: job } = await supabase
        .from("jobs")
        .select("customer_id, customers(first_name, last_name, address, city, state, zip, email, phone)")
        .eq("id", invoice.job_id)
        .single();

      const customer = (job as any)?.customers ?? {};

      // Get company settings
      const { data: settings } = await supabase
        .from("company_settings")
        .select("key, value")
        .in("key", ["company_name", "company_phone", "company_email", "company_address", "license_number"]);

      const settingsMap: Record<string, string> = {};
      for (const s of settings || []) {
        settingsMap[s.key] = s.value;
      }

      const items: InvoiceLineItem[] = ((invoice as any).customer_invoice_items || []).map((i: any) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.total,
        sort_order: i.sort_order,
      }));

      // --- Equipment Documentation ---
      let equipmentDocs: EquipmentDocsData | null = null;
      const customerId = (job as any)?.customer_id;
      const actualJobId = invoice.job_id;

      if (actualJobId) {
        const [oldEqRes, newEqRes, techFormsRes, certsRes] = await Promise.all([
          customerId
            ? supabase.from("customer_equipment").select("id, brand, model_number, serial_number, equipment_type, install_date").eq("customer_id", customerId)
            : Promise.resolve({ data: [] }),
          supabase.from("job_equipment").select("id, brand, model_number, serial_number, source").eq("job_id", actualJobId),
          supabase.from("tech_forms").select("id").eq("job_id", actualJobId),
          customerId
            ? supabase.from("customer_certificates").select("id, certificate_type, token").eq("customer_id", customerId).eq("job_id", actualJobId)
            : Promise.resolve({ data: [] }),
        ]);

        const newEquipment = (newEqRes as any).data || [];

        // AHRI lookups
        const modelNumbers = newEquipment.map((e: any) => e.model_number).filter(Boolean);
        const { data: ahriData } = modelNumbers.length > 0
          ? await supabase.from("ahri_lookups").select("ahri_number, seer2, hspf2, eer2, certificate_path, outdoor_model, indoor_model, furnace_model, energy_star").in("outdoor_model", modelNumbers)
          : { data: [] };

        const ahriWithUrls = (ahriData || []).map((a: any) => {
          let certificateUrl = null;
          if (a.certificate_path) {
            const { data: urlData } = supabase.storage.from("ahri-certificates").getPublicUrl(a.certificate_path);
            certificateUrl = urlData?.publicUrl || null;
          }
          return { ...a, certificateUrl };
        });

        // Photos
        const techFormIds = ((techFormsRes as any).data || []).map((tf: any) => tf.id);
        let photos: any[] = [];
        if (techFormIds.length > 0) {
          const { data: photoData } = await supabase
            .from("tech_form_photos")
            .select("id, file_path, photo_type")
            .in("tech_form_id", techFormIds)
            .in("photo_type", ["before", "after", "data_plate"]);

          photos = (photoData || []).map((p: any) => {
            const { data: urlData } = supabase.storage.from("tech-form-photos").getPublicUrl(p.file_path);
            return { id: p.id, photoType: p.photo_type, url: urlData?.publicUrl || null };
          });
        }

        equipmentDocs = {
          oldEquipment: (oldEqRes as any).data || [],
          newEquipment,
          ahri: ahriWithUrls,
          photos,
          certificates: (certsRes as any).data || [],
        };
      }

      // --- CPS Rebate Eligibility ---
      const TIERS = [
        { name: "Tier 1", min: 13.8, max: 15.1, earlyPer: 115, burnoutPer: 90 },
        { name: "Tier 2", min: 15.2, max: 16.1, earlyPer: 130, burnoutPer: 120 },
        { name: "Tier 3", min: 16.2, max: 17.0, earlyPer: 175, burnoutPer: 150 },
        { name: "Tier 4", min: 17.1, max: 19.9, earlyPer: 250, burnoutPer: 225 },
        { name: "Tier 5", min: 20.0, max: 99, earlyPer: 310, burnoutPer: 275 },
      ];

      let cpsRebate: CpsRebateData | null = null;
      if (equipmentDocs && equipmentDocs.ahri.length > 0) {
        const ahri = equipmentDocs.ahri[0];
        const seer2 = ahri.seer2 ?? 0;
        const eer2 = ahri.eer2 ?? 0;
        const hspf2 = ahri.hspf2 ?? null;
        const tier = TIERS.find(t => seer2 >= t.min && seer2 <= t.max) || null;
        const qualifies = seer2 >= 13.8 && eer2 >= 9.8;
        if (tier) {
          const tons = 3; // default for preview
          cpsRebate = {
            qualifies,
            tierName: tier.name,
            earlyRebate: tier.earlyPer * tons,
            burnoutRebate: tier.burnoutPer * tons,
            seer2,
            eer2,
            hspf2,
            ahriNumber: ahri.ahri_number,
            tonnage: tons,
            condenserModel: ahri.outdoor_model,
            coilModel: ahri.indoor_model,
            furnaceModel: ahri.furnace_model,
            rebateUrl: "https://www.cpsenergy.com/en/my-home/savenow/rebates-incentives/cooling-heating.html",
          };
        }
      }

      return {
        invoice_number: invoice.invoice_number || "—",
        created_at: invoice.created_at,
        status: invoice.status,
        subtotal: invoice.subtotal,
        tax_rate: invoice.tax_rate,
        tax_amount: invoice.tax_amount,
        total: invoice.total,
        notes: invoice.notes,
        paid_at: invoice.paid_at,
        payment_method: invoice.payment_method,
        items,
        customer: {
          first_name: customer.first_name ?? null,
          last_name: customer.last_name ?? null,
          address: customer.address ?? null,
          city: customer.city ?? null,
          state: customer.state ?? null,
          zip: customer.zip ?? null,
          email: customer.email ?? null,
          phone: customer.phone ?? null,
        },
        companyName: settingsMap.company_name || "Your HVAC Company",
        companyPhone: settingsMap.company_phone || "",
        companyEmail: settingsMap.company_email || "",
        companyAddress: settingsMap.company_address || "",
        companyLicense: settingsMap.license_number || "",
        equipmentDocs,
        cpsRebate,
      };
    },
  });
}
