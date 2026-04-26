/**
 * Shared company info loader — ONE SOURCE OF TRUTH.
 * All edge functions that need company name, phone, or email
 * MUST use this helper instead of hardcoding values.
 *
 * Rule 2: One Source of Truth — company_settings table is canonical.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CompanyInfo {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  tacla: string;
}

const KEYS = [
  "company_name",
  "company_phone",
  "company_email",
  "company_address",
  "company_city",
  "company_state",
  "company_zip",
  "tacla_number",
] as const;

export async function loadCompanyInfo(
  supabase: ReturnType<typeof createClient>,
): Promise<CompanyInfo> {
  const { data } = await supabase
    .from("company_settings")
    .select("key, value")
    .in("key", [...KEYS]);

  const map: Record<string, string> = {};
  for (const row of (data as any[]) || []) {
    map[row.key] = row.value;
  }

  return {
    name: map.company_name || "",
    phone: map.company_phone || "",
    email: map.company_email || "",
    address: map.company_address || "",
    city: map.company_city || "San Antonio",
    state: map.company_state || "TX",
    zip: map.company_zip || "",
    tacla: map.tacla_number || "",
  };
}
