export type BusinessUnit = {
  id: string;
  slug: string;
  display_name: string;
  legal_name?: string | null;
  primary_phone_number: string;
  customer_tag: string;
  is_default?: boolean | null;
};

export function normalizeE164Phone(phone: string | null | undefined): string {
  const value = (phone || "").trim();
  if (!value) return "";
  if (value.startsWith("+")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

export function last10(phone: string | null | undefined): string {
  return (phone || "").replace(/\D/g, "").slice(-10);
}

function cleanId(id: string | null | undefined): string {
  return String(id || "").trim();
}

function phonesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftDigits = last10(left);
  const rightDigits = last10(right);
  return leftDigits.length === 10 && leftDigits === rightDigits;
}

export async function fetchActiveBusinessUnits(supabase: any): Promise<BusinessUnit[]> {
  const { data, error } = await supabase
    .from("business_units")
    .select(
      "id, slug, display_name, legal_name, primary_phone_number, customer_tag, is_default",
    )
    .eq("is_active", true)
    .order("is_default", { ascending: false });

  if (error) {
    console.warn("[businessUnits] fetch failed:", error.message || error);
    return [];
  }

  return (data || []) as BusinessUnit[];
}

export async function resolveBusinessUnitByPhone(
  supabase: any,
  phone: string | null | undefined,
): Promise<BusinessUnit | null> {
  const wanted = last10(phone);
  if (!wanted) return null;

  const units = await fetchActiveBusinessUnits(supabase);
  return units.find((unit) => last10(unit.primary_phone_number) === wanted) || null;
}

export async function getDefaultBusinessUnit(supabase: any): Promise<BusinessUnit | null> {
  const units = await fetchActiveBusinessUnits(supabase);
  return units.find((unit) => unit.is_default) || units[0] || null;
}

export async function resolveBusinessUnitById(
  supabase: any,
  id: string | null | undefined,
): Promise<BusinessUnit | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("business_units")
    .select(
      "id, slug, display_name, legal_name, primary_phone_number, customer_tag, is_default",
    )
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.warn("[businessUnits] lookup by id failed:", error.message || error);
    return null;
  }
  return (data as BusinessUnit | null) || null;
}

export async function resolveSmsBusinessUnitForRecipient(
  supabase: any,
  recipientPhone: string,
  requestedBusinessUnitId?: string | null,
  requestedFromNumber?: string | null,
): Promise<{
  businessUnit: BusinessUnit | null;
  fromNumber: string;
  ambiguous: boolean;
  error?: string;
  code?: string;
}> {
  const requestedUnitId = cleanId(requestedBusinessUnitId);
  const requestedFrom = normalizeE164Phone(requestedFromNumber) ||
    String(requestedFromNumber || "").trim();

  if (requestedUnitId) {
    const explicitUnit = await resolveBusinessUnitById(supabase, requestedUnitId);
    if (!explicitUnit) {
      return {
        businessUnit: null,
        fromNumber: "",
        ambiguous: false,
        error: "Sending company is not active or does not exist.",
        code: "invalid_business_unit",
      };
    }

    if (
      requestedFrom &&
      !phonesMatch(explicitUnit.primary_phone_number, requestedFrom)
    ) {
      return {
        businessUnit: null,
        fromNumber: "",
        ambiguous: false,
        error: "Sending company and from_number do not match.",
        code: "business_unit_from_number_mismatch",
      };
    }

    return {
      businessUnit: explicitUnit,
      fromNumber: normalizeE164Phone(explicitUnit.primary_phone_number) ||
        explicitUnit.primary_phone_number,
      ambiguous: false,
    };
  }

  if (requestedFrom) {
    const explicitNumberUnit = await resolveBusinessUnitByPhone(supabase, requestedFrom);
    if (!explicitNumberUnit) {
      return {
        businessUnit: null,
        fromNumber: "",
        ambiguous: false,
        error: "from_number must be an active business unit phone number.",
        code: "invalid_from_number",
      };
    }

    return {
      businessUnit: explicitNumberUnit,
      fromNumber: normalizeE164Phone(explicitNumberUnit.primary_phone_number) ||
        explicitNumberUnit.primary_phone_number,
      ambiguous: false,
    };
  }

  const recipientDigits = last10(recipientPhone);
  const { data: recent } = await supabase
    .from("sms_log")
    .select("to_number, business_unit_id, created_at")
    .eq("phone_number", normalizeE164Phone(recipientPhone) || recipientPhone)
    .not("to_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = ((recent || []) as Array<{
    to_number?: string | null;
    business_unit_id?: string | null;
  }>)
    .filter((row) =>
      row.to_number && last10(row.to_number) !== recipientDigits
    );

  for (const row of rows) {
    const unit = row.business_unit_id
      ? await resolveBusinessUnitById(supabase, row.business_unit_id)
      : await resolveBusinessUnitByPhone(supabase, row.to_number);
    if (unit) {
      return {
        businessUnit: unit,
        fromNumber: normalizeE164Phone(unit.primary_phone_number) ||
          unit.primary_phone_number,
        ambiguous: false,
      };
    }
  }

  const units = await fetchActiveBusinessUnits(supabase);
  if (units.length <= 1) {
    const unit = units[0] || await getDefaultBusinessUnit(supabase);
    const fallback = unit?.primary_phone_number || Deno.env.get("TWILIO_PHONE_NUMBER") || "";
    return {
      businessUnit: unit,
      fromNumber: normalizeE164Phone(fallback) || fallback,
      ambiguous: false,
    };
  }

  return { businessUnit: null, fromNumber: "", ambiguous: true };
}
