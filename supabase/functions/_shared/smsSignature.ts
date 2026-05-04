export const DEFAULT_SMS_SIGNATURE = "-our team";
export const SMS_SIGNATURE = DEFAULT_SMS_SIGNATURE;

export function smsSignatureForCompany(companyName?: string | null) {
  const cleanName = (companyName || "").trim();
  return cleanName ? `-${cleanName}` : DEFAULT_SMS_SIGNATURE;
}

export function appendSmsSignature(body: string, maxLength = 1600, signature = DEFAULT_SMS_SIGNATURE) {
  const trimmed = (body || "").trimEnd();
  const cleanSignature = signature.trim() || DEFAULT_SMS_SIGNATURE;
  if (trimmed.includes(cleanSignature)) return trimmed.slice(0, maxLength);

  const separator = trimmed ? "\n\n" : "";
  const available = Math.max(0, maxLength - separator.length - cleanSignature.length);
  const safeBody = trimmed.length > available ? trimmed.slice(0, available).trimEnd() : trimmed;

  return `${safeBody}${safeBody ? separator : ""}${cleanSignature}`.slice(0, maxLength);
}
