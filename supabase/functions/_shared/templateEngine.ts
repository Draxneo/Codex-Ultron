/**
 * templateEngine — Deterministic variable resolver for SMS/email templates.
 *
 * Replaces {{token}} placeholders with values from job, company settings, and employee data.
 * Missing values become empty string — never crashes.
 */

import { formatDateFriendly, formatTimeWindow } from "./formatters.ts";

/**
 * Resolve all {{variable}} tokens in a template body.
 */
export function resolveTemplate(
  templateBody: string,
  job: Record<string, any>,
  company: Record<string, string>,
  employee?: Record<string, any> | null
): string {
  // Build friendly time window
  const timeWindow = formatTimeWindow(job.arrival_start, job.arrival_end) || "TBD";

  const vars: Record<string, string> = {
    // Customer fields
    first_name: job.customer_name?.split(" ")[0] || "",
    last_name: job.customer_name?.split(" ").slice(1).join(" ") || "",
    customer_name: job.customer_name || "",
    customer_phone: job.customer_phone || "",
    customer_email: job.customer_email || "",

    // Job fields
    job_number: job.hcp_job_number || job.job_number || "",
    job_type: job.job_type || "",
    scheduled_date: formatDateFriendly(job.scheduled_date),
    time_window: timeWindow,
    arrival_window: timeWindow,
    address: job.address || "",
    eta_minutes: job.eta_minutes ? String(job.eta_minutes) : "",
    eta_text: job.eta_minutes ? `ETA is ${job.eta_minutes} minutes.` : "",

    // Tech fields
    assigned_to: job.assigned_to || "",
    tech_name: employee?.name || job.assigned_to || "",
    tech_phone: employee?.phone || "",

    // Company fields
    company_name: company.company_name || "",
    company_phone: company.company_phone || "",
    a2p_footer: company.a2p_footer || "Reply STOP to opt out.",
  };

  return templateBody.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return vars[key] ?? "";
  });
}

/**
 * Load company settings as a flat key→value map.
 */
export async function loadCompanySettings(
  supabase: any,
  keys: string[]
): Promise<Record<string, string>> {
  const uniqueKeys = Array.from(new Set(keys));
  const { data } = await supabase
    .from("company_settings")
    .select("key, value")
    .in("key", uniqueKeys);

  const map: Record<string, string> = {};
  for (const row of data || []) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * Pre-flight validation: check that all required fields exist on the job record.
 * Returns list of missing field names, or empty array if all present.
 */
export function checkRequiredFields(
  job: Record<string, any>,
  requiredFields: string[]
): string[] {
  return requiredFields.filter((field) => {
    const val = job[field];
    return val === null || val === undefined || val === "";
  });
}
