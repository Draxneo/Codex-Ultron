import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * resolveOrCreateCustomerByPhone — Ensure every inbound/outbound contact has a customer record.
 *
 * PROBLEM: When Rudy called Carnes and Sons, voice-webhook logged the call WITHOUT a
 * related_customer_id. Minutes later, summarize-call extracted his name from the transcript
 * and created a customer record. But call_log + sms_log rows stayed orphaned (NULL link).
 *
 * SOLUTION: This helper looks up an existing customer by phone. If not found and
 * skipCreate is false, it auto-creates a stub. Inbound handlers (voice, SMS) call this
 * BEFORE persisting, so every contact gets a customer ID on insert. Outbound handlers
 * call with skipCreate=true to avoid creating stubs for numbers that never contacted us.
 *
 * RETURNS: { customerId: string | null, created: boolean }
 *   - customerId = null if phone is invalid, employee, or not found + skipCreate=true
 *   - created = true only if we auto-created a stub
 *
 * Why employees are skipped: Employee phone numbers should not create customer records.
 * Why inbound creates stubs: We want to track all inbound contacts as potential leads.
 * Why outbound can skip: Manually sending to a new number doesn't auto-create the contact.
 */
export async function resolveOrCreateCustomerByPhone(
  supabase: SupabaseClient,
  phone: string,
  options?: {
    businessUnitId?: string | null;
    sourceLabel?: string; // e.g. "inbound_call", "inbound_sms", "outbound_sms"
    contactName?: string | null;
    skipCreate?: boolean;
  }
): Promise<{ customerId: string | null; created: boolean }> {
  // ── Step 1: Normalize and validate phone ──────────────────────────
  // Strip all non-digits, take last 10 to handle international formatting
  const normalizedPhone = String(phone || "").replace(/\D/g, "").slice(-10);

  // Reject invalid phone numbers
  if (normalizedPhone.length !== 10) {
    return { customerId: null, created: false };
  }

  // Reject anonymous numbers (Twilio SIP fraud, etc.)
  const anonymousPatterns = ["anonymous", "unknown", "+anonymous"];
  if (anonymousPatterns.some(p => String(phone).toLowerCase().includes(p))) {
    return { customerId: null, created: false };
  }

  // ── Step 2: Check if this is an employee phone ──────────────────
  // Why: Employee lines should not auto-create customer records. They're internal.
  // Load all active employees (small table ~10 records) and match by normalized phone.
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, phone, is_active")
    .eq("is_active", true);

  const isEmployeePhone = (employees || []).some((emp: any) => {
    if (!emp.phone) return false;
    return emp.phone.replace(/\D/g, "").slice(-10) === normalizedPhone;
  });

  if (isEmployeePhone) {
    return { customerId: null, created: false };
  }

  // ── Step 3: Look up existing customer by phone ──────────────────
  // Uses find_customer_by_phone RPC (server-side digit normalization).
  // Matches the last-10 digits of any phone field in the customers table.
  const { data: matchedCustomer } = await supabase
    .rpc("find_customer_by_phone", { digits: normalizedPhone })
    .limit(1)
    .maybeSingle();

  if (matchedCustomer) {
    return { customerId: (matchedCustomer as any).id, created: false };
  }

  // ── Step 4: Decide whether to create a stub ──────────────────────
  // skipCreate=true: Outbound SMS handlers don't want to create stubs for
  //   numbers that never contacted us. Caller will handle missing customer.
  // skipCreate=false (default): Inbound handlers want to track all contacts.
  if (options?.skipCreate === true) {
    return { customerId: null, created: false };
  }

  // ── Step 5: Create stub customer record ──────────────────────────
  // Stub has minimal data to link communication logs to a customer.
  // - first_name: from contactName if provided, else "Unknown"
  // - phone: normalized to E.164 format
  // - primary_business_unit_id: from context (inbound to which company?)
  // - state: "TX" (Texas — single-state operation per Studio_Rules)
  // - text_consent: "opted_in" for inbound (they called/texted us),
  //   "unknown" for outbound (we sent to them)
  // - notes: records when and how stub was created (audit trail)

  const now = new Date().toISOString();
  const first_name = options?.contactName?.split(" ")[0]?.trim() || "Unknown";
  const last_name = options?.contactName?.split(" ").slice(1).join(" ")?.trim() || null;

  const isInboundSource = options?.sourceLabel?.startsWith("inbound") ?? false;
  const text_consent = isInboundSource ? "opted_in" : "unknown";

  const notes = `Auto-created from ${options?.sourceLabel || "contact"} on ${now}`;

  // Construct normalized E.164 phone (always +1 for US)
  const e164Phone = `+1${normalizedPhone}`;

  const { data: created, error: createErr } = await supabase
    .from("customers")
    .insert({
      first_name,
      last_name,
      phone: e164Phone,
      primary_business_unit_id: options?.businessUnitId || null,
      state: "TX",
      text_consent,
      notes,
    })
    .select("id")
    .single();

  if (createErr || !created) {
    console.error("Failed to auto-create customer stub:", createErr);
    return { customerId: null, created: false };
  }

  const customerId = (created as any).id;
  console.log(
    `[resolveOrCreateCustomerByPhone] Auto-created stub customer ${customerId} ` +
    `from ${options?.sourceLabel || "contact"}: ${first_name} / ${e164Phone}`
  );

  return { customerId, created: true };
}
