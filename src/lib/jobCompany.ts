import { supabase } from "@/integrations/supabase/client";
import { getCompanySettings } from "@/lib/companySettings";

export async function getJobCompanyName(jobId?: string | null, fallback = "our team") {
  if (jobId) {
    try {
      const { data, error } = await (supabase as any)
        .from("jobs")
        .select("business_unit_id, business_units(display_name, legal_name, billing_name)")
        .eq("id", jobId)
        .maybeSingle();

      if (!error) {
        const unit = Array.isArray(data?.business_units) ? data.business_units[0] : data?.business_units;
        const name = unit?.billing_name || unit?.legal_name || unit?.display_name;
        if (name) return String(name);
      }
    } catch {
      // Non-fatal: customer-facing copy should still send with a safe fallback.
    }
  }

  try {
    const settings = await getCompanySettings(["company_name"]);
    return settings.company_name || fallback;
  } catch {
    return fallback;
  }
}
