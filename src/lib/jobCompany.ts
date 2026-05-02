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

export async function getJobCompanyPhone(jobId?: string | null, fallback = "") {
  if (jobId) {
    try {
      const { data, error } = await (supabase as any)
        .from("jobs")
        .select("business_unit_id, business_units(primary_phone_number)")
        .eq("id", jobId)
        .maybeSingle();

      if (!error) {
        const unit = Array.isArray(data?.business_units) ? data.business_units[0] : data?.business_units;
        const phone = unit?.primary_phone_number;
        if (phone) return String(phone);
      }
    } catch {
      // Non-fatal: callers can decide how to handle a missing dispatch line.
    }
  }

  try {
    const settings = await getCompanySettings(["company_phone"]);
    return settings.company_phone || fallback;
  } catch {
    return fallback;
  }
}
