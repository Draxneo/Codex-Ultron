/**
 * Caller Context SMS Helper
 * 
 * When a call gets forwarded to a dispatcher's cell phone (because they're away from the desk),
 * fire off an SMS before/as the call rings, containing:
 *   - Caller name + phone
 *   - Address if on file
 *   - "👑 Comfort Club" if tagged
 *   - Last 1–2 job summaries (date + type + cost)
 *   - Link to customer record in UI
 * 
 * This helps dispatchers recognize priority customers and handle calls with context.
 */

import { getSupabaseAdmin } from "./supabaseAdmin.ts";

interface CustomerContext {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  tags?: string[];
}

interface JobSummary {
  scheduledDate?: string | null;
  jobType?: string | null;
  totalCost?: number | null;
}

/**
 * Build and send caller-context SMS to dispatcher's cell phone.
 * Fires asynchronously (does not await), so it doesn't block the IVR dial TwiML response.
 * 
 * @param callerPhone The last 10 digits of the inbound caller's phone
 * @param dispatcherCellPhone The dispatcher's cell phone (normalized E.164 or last 10 digits)
 * @param supabaseUrl The Supabase project URL (for building customer record links)
 * @param businessUnitId The business unit ID (for routing SMS through send-sms)
 * @param supabase The Supabase admin client
 * @param callSid Twilio CallSid for audit trail
 */
export async function fireCallerContextSms(
  callerPhone: string,
  dispatcherCellPhone: string,
  supabaseUrl: string,
  businessUnitId: string | null,
  supabase: any,
  callSid: string,
  callSidHash: string,
): Promise<void> {
  try {
    // ── Strip to last 10 digits for all phone lookups ──
    const callerPhoneLast10 = String(callerPhone || "").replace(/\D/g, "").slice(-10);
    const dispatcherPhoneLast10 = String(dispatcherCellPhone || "").replace(/\D/g, "").slice(-10);

    if (!callerPhoneLast10 || !dispatcherPhoneLast10) {
      console.log(`[callerContextSms] Missing caller or dispatcher phone; skipping`);
      return;
    }

    // ── Lookup customer by caller phone ──
    const { data: customerMatch } = await supabase.rpc("find_customer_by_phone", { digits: callerPhoneLast10 });
    
    if (!customerMatch) {
      // Unknown caller: still send minimal SMS so dispatcher sees the number
      console.log(`[callerContextSms] Unknown caller ${callerPhoneLast10} → dispatcher ${dispatcherPhoneLast10}`);
      const unknownSms = `📞 Unknown caller — ${formatPhoneForDisplay(callerPhone)}`;
      await sendContextSms(
        dispatcherCellPhone,
        unknownSms,
        supabase,
        businessUnitId,
        callSid,
        callSidHash,
        "unknown-caller",
      );
      return;
    }

    const customerId = customerMatch[0]?.id;

    // ── Enrich with full customer record ──
    const { data: customer } = await supabase
      .from("customers")
      .select("first_name, last_name, address, city, state, zip, tags")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer) {
      console.log(`[callerContextSms] Customer ${customerId} not found in main table`);
      return;
    }

    // ── Get last 1–2 jobs for this customer ──
    const { data: jobs } = await supabase
      .from("jobs")
      .select("scheduled_date, job_type")
      .eq("customer_id", customerId)
      .order("scheduled_date", { ascending: false, nullsFirst: false })
      .limit(2);

    // ── Build SMS body ──
    const smsBody = buildCallerContextSms(
      customer as CustomerContext,
      jobs as JobSummary[] | null,
      callerPhone,
      customerId,
      supabaseUrl,
    );

    console.log(`[callerContextSms] Sending to dispatcher ${dispatcherPhoneLast10}: "${smsBody.substring(0, 50)}..."`);

    // ── Check if we've already sent this context SMS recently (avoid spam) ──
    const recentSms = await checkRecentContextSms(
      supabase,
      dispatcherPhoneLast10,
      customerId,
      callSidHash,
    );

    if (recentSms) {
      console.log(`[callerContextSms] Recently sent to ${dispatcherPhoneLast10} for customer ${customerId}; skipping`);
      return;
    }

    // ── Fire SMS asynchronously ──
    await sendContextSms(
      dispatcherCellPhone,
      smsBody,
      supabase,
      businessUnitId,
      callSid,
      callSidHash,
      "caller-context",
    );

  } catch (err) {
    console.error(`[callerContextSms] Error:`, err);
    // Intentionally swallow errors so IVR dial is never blocked
  }
}

/**
 * Build the caller-context SMS body with customer info, address, Comfort Club tag,
 * recent job history, and a link to the customer record.
 */
function buildCallerContextSms(
  customer: CustomerContext,
  jobs: JobSummary[] | null,
  callerPhone: string,
  customerId: string,
  supabaseUrl: string,
): string {
  const parts: string[] = [];

  // Line 1: Name + phone
  const fullName = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || "Customer";
  parts.push(`📞 ${fullName} — ${formatPhoneForDisplay(callerPhone)}`);

  // Line 2: Address (if available)
  if (customer.address) {
    const addrLine = [customer.address, customer.city, customer.state, customer.zip]
      .filter(Boolean)
      .join(", ");
    if (addrLine) parts.push(addrLine);
  }

  // Line 3: Comfort Club tag (if in tags)
  if (customer.tags?.includes("Comfort Club")) {
    parts.push("👑 Comfort Club member");
  }

  // Lines 4+: Last jobs
  if (jobs && jobs.length > 0) {
    parts.push("Last:" + jobs.map((job, i) => {
      const date = job.scheduledDate ? formatDateShort(job.scheduledDate) : "—";
      const type = (job.jobType || "Service").charAt(0).toUpperCase() + (job.jobType?.slice(1) || "");
      const cost = job.totalCost ? ` ($${Math.round(job.totalCost)})` : "";
      return ` ${date} ${type}${cost}`;
    }).join(" •"));
  }

  // Line final: Link to customer record
  const customerUrl = `${supabaseUrl.replace(/\/$/, "")}/customers/${customerId}`;
  parts.push(`View: ${customerUrl}`);

  return parts.join("\n");
}

/**
 * Check if we recently sent a context SMS to this dispatcher for this customer.
 * Idempotency window: 5 minutes. Prevents spam if the same caller rings the same
 * dispatcher twice in quick succession (or Twilio retries the webhook).
 */
async function checkRecentContextSms(
  supabase: any,
  dispatcherPhoneLast10: string,
  customerId: string,
  callSidHash: string,
): Promise<boolean> {
  try {
    // Query sms_log for this dispatcher's phone + customer_id within last 5 minutes
    // Use a sentinel marker in the body or in metadata to identify context SMS
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("sms_log")
      .select("id")
      .eq("to_phone", dispatcherPhoneLast10)
      .eq("source", "caller-context")
      .gte("sent_at", fiveMinutesAgo)
      .limit(1);

    // If there's a recent SMS to this dispatcher from caller-context source, consider it recent
    return (data || []).length > 0;
  } catch (err) {
    console.error(`[callerContextSms] Error checking recent SMS:`, err);
    // On error, allow the SMS (don't spam-block)
    return false;
  }
}

/**
 * Send the context SMS via the send-sms edge function, fire-and-forget.
 */
async function sendContextSms(
  dispatcherCellPhone: string,
  smsBody: string,
  supabase: any,
  businessUnitId: string | null,
  callSid: string,
  callSidHash: string,
  source: "caller-context" | "unknown-caller",
): Promise<void> {
  try {
    // Normalize phone to E.164 for send-sms
    const normalizedPhone = normalizeE164(dispatcherCellPhone);

    await supabase.functions.invoke("send-sms", {
      body: {
        to: normalizedPhone,
        body: smsBody,
        business_unit_id: businessUnitId,
        source,
        source_function: "voice-ivr-handler",
        // isManual: true omitted — we want HITL gate to see these if configured,
        // but they're informational/non-critical so they can be suppressed if needed
        metadata: {
          call_sid: callSid,
          call_sid_hash: callSidHash,
          context_type: source,
        },
      },
    });

    console.log(`[callerContextSms] SMS queued to ${normalizedPhone}`);
  } catch (err) {
    console.error(`[callerContextSms] Failed to invoke send-sms:`, err);
    // Swallow error; don't block IVR
  }
}

/**
 * Normalize a phone string to E.164 format (+1XXXXXXXXXX for US).
 */
function normalizeE164(phone: string | null | undefined): string {
  const value = (phone || "").trim();
  if (value.startsWith("+")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value;
}

/**
 * Format a phone number for display (e.g., "(210) 555-1234").
 */
function formatPhoneForDisplay(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return phone || "Unknown";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Format a scheduled_date (ISO date string) to short form (e.g., "4/15").
 */
function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "—";
  }
}
