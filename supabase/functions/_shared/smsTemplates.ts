import { resolveTemplate, loadCompanySettings } from "./templateEngine.ts";
import { resolveBusinessUnitById } from "./businessUnits.ts";

export type SmsTemplateRecord = {
  id: string;
  name: string;
  slug: string | null;
  category: string;
  template_body: string;
  is_active: boolean | null;
};

export async function loadSmsTemplateByKey(
  supabase: any,
  key?: string | null,
): Promise<SmsTemplateRecord | null> {
  if (!key?.trim()) return null;
  const normalized = key.trim();

  const queries = [
    supabase.from("sms_templates").select("id, name, slug, category, template_body, is_active").eq("slug", normalized).eq("is_active", true).limit(1).maybeSingle(),
    supabase.from("sms_templates").select("id, name, slug, category, template_body, is_active").eq("name", normalized).eq("is_active", true).limit(1).maybeSingle(),
  ];

  for (const query of queries) {
    const { data, error } = await query;
    if (error) continue;
    if (data) return data as SmsTemplateRecord;
  }

  return null;
}

export async function resolveSmsTemplateBody(opts: {
  supabase: any;
  templateKey?: string | null;
  fallbackBody?: string | null;
  job?: Record<string, any> | null;
  employee?: Record<string, any> | null;
  extraVars?: Record<string, string | null | undefined>;
  businessUnitId?: string | null;
}) {
  const { supabase, templateKey, fallbackBody, job, employee, extraVars, businessUnitId } = opts;
  const template = await loadSmsTemplateByKey(supabase, templateKey);
  const bodySource = template?.template_body || fallbackBody || "";
  const company = await loadCompanySettings(supabase, ["company_name", "company_phone", "a2p_footer"]);
  const unit = await resolveBusinessUnitById(supabase, businessUnitId || job?.business_unit_id || null);
  if (unit) {
    company.company_name = unit.display_name || company.company_name || "";
    company.company_phone = unit.primary_phone_number || company.company_phone || "";
  }

  let preparedBody = bodySource;
  if (extraVars) {
    preparedBody = preparedBody.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = extraVars[key];
      return value === null || value === undefined ? match : String(value);
    });
  }
  let body = resolveTemplate(preparedBody, job || {}, company, employee);
  if (extraVars) {
    body = body.replace(/\{\{(\w+)\}\}/g, (_match, key) => extraVars[key] ?? "");
  }

  return {
    body,
    templateKey: template?.slug || template?.name || templateKey || null,
    templateName: template?.name || null,
    usedFallback: !template,
  };
}
