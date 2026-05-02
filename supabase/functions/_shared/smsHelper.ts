import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function last10(phone: string | null | undefined): string {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

function splitSettingList(value: string | null | undefined): string[] {
  return String(value || "")
    .split(/[,\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function isSmsTestNumber(
  supabase: ReturnType<typeof createClient>,
  phone: string | null | undefined,
): Promise<boolean> {
  const target = last10(phone);
  if (target.length !== 10) return false;

  try {
    const { data } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "sms_test_numbers")
      .maybeSingle();

    return splitSettingList((data as any)?.value).some((candidate) => last10(candidate) === target);
  } catch (error) {
    console.warn("SMS test number lookup failed:", error);
    return false;
  }
}

/**
 * Shared SMS sender for IVR auto-reply messages.
 * Routes ALL sends through `send-sms` for centralized:
 *   - HITL gate
 *   - SMS safety lock
 *   - Grammar check
 *   - sms_log insertion
 *   - Twilio delivery
 */
export async function sendIvrSms(opts: {
  to: string;
  body: string;
  contactName: string | null;
  contactType: string;
  supabase: ReturnType<typeof createClient>;
  skipEmployeeFilter?: boolean;
  jobId?: string;
  sourceFunction?: string;
  templateKey?: string | null;
  businessUnitId?: string | null;
  fromNumber?: string | null;
}): Promise<void> {
  const {
    to,
    body,
    contactType,
    supabase,
    skipEmployeeFilter,
    jobId,
    sourceFunction,
    templateKey,
    businessUnitId,
    fromNumber,
  } = opts;

  // Skip employee numbers unless explicitly overridden
  if (!to) return;
  const testNumberBypass = await isSmsTestNumber(supabase, to);
  if (!skipEmployeeFilter && !testNumberBypass && contactType === "employee") return;

  try {
    const { data: companyNameRow } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "company_name")
      .maybeSingle();

    const companyName = (companyNameRow as any)?.value?.trim() || "";
    const footer = companyName ? `—${companyName}` : "";
    void footer;
    const trimmedBody = (body || "").trim();
    const finalBody = trimmedBody;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const resp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "x-source-function": sourceFunction || "ivr-auto-reply",
        "x-hitl-approved": "true",
      },
      body: JSON.stringify({
        to,
        body: finalBody,
        job_id: jobId || null,
        source: sourceFunction || "ivr-auto-reply",
        template_key: templateKey || null,
        business_unit_id: businessUnitId || null,
        from_number: fromNumber || null,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      console.log(`IVR auto-reply routed through send-sms for ${to}:`, data.blocked ? "blocked (test mode)" : data.queued ? "queued (HITL)" : "sent");
    } else {
      const errText = await resp.text();
      console.error("IVR auto-reply via send-sms failed:", resp.status, errText);
    }
  } catch (err) {
    console.error("IVR auto-reply SMS routing error:", err);
  }
}

/**
 * Shared dedup helper — returns true if any outbound SMS has been sent
 * to this number within the last `windowMinutes` minutes. Used to prevent
 * duplicate missed-call SMS from firing across multiple webhooks.
 */
export async function recentOutboundExists(
  supabase: ReturnType<typeof createClient>,
  phoneNumber: string,
  windowMinutes: number = 30,
  opts: { businessUnitId?: string | null; fromNumber?: string | null } = {},
): Promise<boolean> {
  if (!phoneNumber) return false;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  // Match against last 10 digits to handle +1XXXXXXXXXX vs XXXXXXXXXX variations
  const targetLast10 = phoneNumber.replace(/\D/g, "").slice(-10);
  if (targetLast10.length !== 10) return false;
  try {
    let query = supabase
      .from("sms_log")
      .select("id, phone_number, to_number, business_unit_id")
      .eq("direction", "outbound")
      .gte("created_at", since)
      .limit(50);

    if (opts.businessUnitId) {
      query = query.eq("business_unit_id", opts.businessUnitId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("recentOutboundExists query failed:", error);
      return false;
    }
    const fromLast10 = opts.fromNumber ? last10(opts.fromNumber) : "";
    return (data || []).some((r: any) =>
      (r.phone_number || "").replace(/\D/g, "").slice(-10) === targetLast10 &&
      (!fromLast10 || last10(r.to_number) === fromLast10)
    );
  } catch (e) {
    console.warn("recentOutboundExists error:", e);
    return false;
  }
}
