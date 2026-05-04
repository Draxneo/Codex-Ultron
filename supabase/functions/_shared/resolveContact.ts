import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * resolveContact — Efficiently identify who is calling or texting.
 *
 * PERFORMANCE FIX: Previous code loaded ALL employees + ALL customers into memory
 * and filtered in JavaScript. With 2000+ customers this was slow and wasteful.
 *
 * Now:
 * - Employees: still loaded all at once (only ~10 records — fine forever)
 * - Customers: single targeted DB query using phone suffix match
 *   The DB has indexes, finds the record in milliseconds regardless of table size.
 *
 * Phone matching uses suffix (last 10 digits) to handle any storage format:
 *   +12105551234, (210) 555-1234, 2105551234 — all match "2105551234"
 */
export async function resolveContact(
  supabase: SupabaseClient,
  phone: string
): Promise<{ contactName: string | null; contactType: string; matchedEmployee: any | null }> {
  const normalizedPhone = phone.replace(/\D/g, "").slice(-10);
  if (!normalizedPhone) return { contactName: null, contactType: "unknown", matchedEmployee: null };

  // ── Step 0: Check known_contacts (user-trained labels — vendors, marketing, spam, etc.) ──
  // This runs FIRST so a known vendor never gets misclassified as a customer lead.
  const { data: known } = await supabase
    .from("known_contacts")
    .select("name, contact_type")
    .eq("phone_digits", normalizedPhone)
    .maybeSingle();

  if (known) {
    return { contactName: (known as any).name, contactType: (known as any).contact_type, matchedEmployee: null };
  }

  // ── Step 1: Check employees (small table, load all active ones) ──
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, phone, is_active")
    .eq("is_active", true);

  const matchedEmployee = (employees || []).find((emp: any) => {
    if (!emp.phone) return false;
    return emp.phone.replace(/\D/g, "").slice(-10) === normalizedPhone;
  });

  if (matchedEmployee) {
    return { contactName: matchedEmployee.name, contactType: "employee", matchedEmployee };
  }

  // ── Step 2: Check customers — DB function strips non-digits before comparing ──
  // Uses regexp_replace server-side so (210) 827-3503 matches 2108273503.
  const { data: matchedCustomer } = await supabase
    .rpc("find_customer_by_phone", { digits: normalizedPhone })
    .limit(1)
    .maybeSingle();

  if (matchedCustomer) {
    const cust = matchedCustomer as { first_name?: string | null; last_name?: string | null };
    const contactName = [cust.first_name, cust.last_name]
      .filter(Boolean).join(" ") || null;
    return { contactName, contactType: "customer", matchedEmployee: null };
  }

  // ── Step 3: Check estimates (leads/prospects not yet in customers table) ──
  const { data: estRows } = await supabase
    .from("estimates")
    .select("customer_name, customer_phone")
    .not("customer_phone", "is", null)
    .not("customer_name", "is", null)
    .limit(500);

  const matchedEstimate = (estRows || []).find((e: any) => {
    if (!e.customer_phone) return false;
    return e.customer_phone.replace(/\D/g, "").slice(-10) === normalizedPhone;
  });

  if (matchedEstimate?.customer_name) {
    return { contactName: matchedEstimate.customer_name, contactType: "lead", matchedEmployee: null };
  }

  // ── Step 4: Check jobs (may have customer_name without a customers record) ──
  const { data: jobRows } = await supabase
    .from("jobs")
    .select("customer_name, customer_phone")
    .not("customer_phone", "is", null)
    .not("customer_name", "is", null)
    .limit(500);

  const matchedJob = (jobRows || []).find((j: any) => {
    if (!j.customer_phone) return false;
    return j.customer_phone.replace(/\D/g, "").slice(-10) === normalizedPhone;
  });

  if (matchedJob?.customer_name) {
    return { contactName: matchedJob.customer_name, contactType: "customer", matchedEmployee: null };
  }

  return { contactName: null, contactType: "unknown", matchedEmployee: null };
}
