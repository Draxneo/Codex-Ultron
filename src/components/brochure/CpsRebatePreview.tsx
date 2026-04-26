import { useEffect, useState } from "react";
import CpsRebateForm from "@/components/CpsRebateForm";
import type { CpsRebateJobData, CpsRebateEquipmentData, CpsRebateCompanyData } from "@/components/CpsRebateForm";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";

const sampleJob: CpsRebateJobData = {
  jobId: "sample-001",
  customerName: "Sarah Johnson",
  address: "4521 Oak Meadow Ln, San Antonio, TX 78245",
  phone: "(210) 555-0147",
  email: "sarah.johnson@email.com",
  scheduledDate: new Date().toISOString(),
  jobType: "install",
  parsedTonnage: 3,
  jobNumber: "J-10247",
};

const sampleEquipment: CpsRebateEquipmentData = {
  brand: "Trane",
  condenserModel: "4TWR6036J1000AA",
  coilModel: "TEM6A0C42H41SBA",
  furnaceModel: undefined,
  ahriNumber: "210584321",
  seer2: 16.0,
  eer2: 12.2,
  hspf2: undefined,
  coolingCap: 36000,
  systemType: "central_ac",
};

interface CpsRebatePreviewProps {
  jobId?: string;
}

export default function CpsRebatePreview({ jobId }: CpsRebatePreviewProps) {
  const { settings } = useCompanySettings();
  const [liveJob, setLiveJob] = useState<CpsRebateJobData | null>(null);
  const [liveEquipment, setLiveEquipment] = useState<CpsRebateEquipmentData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) { setLiveJob(null); setLiveEquipment(null); return; }
    setLoading(true);
    (async () => {
      const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single();
      if (!job) { setLoading(false); return; }

      // Try to get equipment data from job_equipment or AHRI
      const { data: equip } = await supabase
        .from("job_equipment")
        .select("*")
        .eq("job_id", jobId)
        .limit(1)
        .maybeSingle();

      const { data: ahri } = await supabase
        .from("ahri_lookups")
        .select("*")
        .eq("linked_matchup_id", (equip as any)?.matchup_id || "")
        .limit(1)
        .maybeSingle();

      setLiveJob({
        jobId: job.id,
        customerName: job.customer_name || "",
        address: job.address || "",
        phone: job.customer_phone || "",
        email: job.customer_email || "",
        scheduledDate: job.scheduled_date || "",
        jobType: job.job_type || "",
        parsedTonnage: (equip as any)?.tonnage || 3,
        jobNumber: job.job_number || job.hcp_job_number || "",
      });

      setLiveEquipment({
        brand: (equip as any)?.brand || ahri?.outdoor_brand || "",
        condenserModel: (equip as any)?.condenser_model || ahri?.outdoor_model || "",
        coilModel: (equip as any)?.coil_model || ahri?.indoor_model || "",
        furnaceModel: ahri?.furnace_model || undefined,
        ahriNumber: ahri?.ahri_number || "",
        seer2: ahri?.seer2 || 0,
        eer2: ahri?.eer2 || 0,
        hspf2: ahri?.hspf2 || undefined,
        coolingCap: ahri?.cooling_cap_btuh || 0,
        systemType: "central_ac",
      });

      setLoading(false);
    })();
  }, [jobId]);

  const sampleCompany: CpsRebateCompanyData = {
    companyName: settings.company_name || "Your HVAC Company",
    contactName: settings.contact_name || "John Smith",
    licenseNumber: settings.tacla_number || "TACLA#12345",
    companyPhone: settings.company_phone || "(210) 555-0100",
    companyEmail: settings.company_email || "info@yourhvac.com",
    companyAddress: [
      settings.company_address,
      settings.company_city,
      settings.company_state,
      settings.company_zip,
    ].filter(Boolean).join(", ") || "123 Main St, San Antonio, TX 78201",
  };

  const useLive = !!jobId && !!liveJob;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border overflow-hidden shadow-lg">
        <p className="text-xs text-muted-foreground text-center py-2 bg-muted/80 border-b border-border">
          ▾ Live Preview — {useLive ? "Real Job Data" : "Sample Data (Full CPS Energy Rebate Form)"}
        </p>
        <div className="bg-background p-4">
          <CpsRebateForm
            job={useLive ? liveJob! : sampleJob}
            equipment={useLive && liveEquipment ? liveEquipment : sampleEquipment}
            company={sampleCompany}
          />
        </div>
      </div>
    </div>
  );
}
