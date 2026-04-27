export function normalizeE164Phone(phone: string | null | undefined): string {
  const value = (phone || "").trim();
  if (!value) return "";
  if (value.startsWith("+")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value;
}

export function normalizeNorthAmericaOutbound(phone: string | null | undefined): string | null {
  const normalized = normalizeE164Phone(phone);
  return /^\+1\d{10}$/.test(normalized) ? normalized : null;
}

export function getTwilioCallerId(): string {
  return normalizeE164Phone(
    Deno.env.get("TWILIO_CALLER_ID") || Deno.env.get("TWILIO_PHONE_NUMBER") || "",
  );
}

export function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  return `***${digits.slice(-4)}`;
}
