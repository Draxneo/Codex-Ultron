import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
}): Promise<void> {
  const { to, body, contactType, supabase, skipEmployeeFilter, jobId, sourceFunction, templateKey } = opts;

  // Skip employee numbers unless explicitly overridden
  if (!skipEmployeeFilter && (contactType === "employee" || !to)) return;
  if (!to) return;

  try {
    const { data: companyNameRow } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "company_name")
      .maybeSingle();

    const companyName = (companyNameRow as any)?.value?.trim() || "";
    const footer = companyName ? `—${companyName}` : "";
    const trimmedBody = (body || "").trim();
    const finalBody = footer && !trimmedBody.endsWith(footer)
      ? `${trimmedBody}\n${footer}`
      : trimmedBody;

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
  windowMinutes: number = 30
): Promise<boolean> {
  if (!phoneNumber) return false;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  // Match against last 10 digits to handle +1XXXXXXXXXX vs XXXXXXXXXX variations
  const last10 = phoneNumber.replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return false;
  try {
    const { data, error } = await supabase
      .from("sms_log")
      .select("id, phone_number")
      .eq("direction", "outbound")
      .gte("created_at", since)
      .limit(50);
    if (error) {
      console.warn("recentOutboundExists query failed:", error);
      return false;
    }
    return (data || []).some((r: any) =>
      (r.phone_number || "").replace(/\D/g, "").slice(-10) === last10
    );
  } catch (e) {
    console.warn("recentOutboundExists error:", e);
    return false;
  }
}
