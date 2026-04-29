export const SMS_SIGNATURE = "—Carnes and Sons Air Conditioning";

export function appendSmsSignature(body: string, maxLength = 1600) {
  const trimmed = (body || "").trimEnd();
  if (trimmed.includes(SMS_SIGNATURE)) return trimmed.slice(0, maxLength);

  const separator = trimmed ? "\n\n" : "";
  const available = Math.max(0, maxLength - separator.length - SMS_SIGNATURE.length);
  const safeBody = trimmed.length > available ? trimmed.slice(0, available).trimEnd() : trimmed;

  return `${safeBody}${safeBody ? separator : ""}${SMS_SIGNATURE}`.slice(0, maxLength);
}
