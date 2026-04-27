import { supabase } from "@/integrations/supabase/client";

const IMPORTANT_PHONE_DEBUG_TAGS = new Set([
  "state.transition",
  "call.disconnect",
  "call.cancel",
  "call.reject",
  "call.error",
  "call.warning",
  "call.reconnecting",
  "call.reconnected",
  "call.accept",
  "call.ringing",
  "device.error",
  "incoming.received",
  "incoming.auto-reject",
  "outgoing.connect.request",
  "native.state.transition",
  "native.call.invite",
  "native.call.connected",
  "native.call.disconnected",
  "native.call.failed",
  "native.registration.failed",
]);

const SENSITIVE_KEY_RE = /(token|secret|password|authorization|apikey|api_key|jwt|credential)/i;
const PHONE_RE = /^\+?\d[\d\s().-]{7,}\d$/;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[max-depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (PHONE_RE.test(value.trim())) {
      const digits = value.replace(/\D/g, "");
      return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
    }
    return value.length > 600 ? `${value.slice(0, 600)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      output[key] = SENSITIVE_KEY_RE.test(key) ? "[redacted]" : sanitizeValue(nested, depth + 1);
    }
    return output;
  }
  return String(value);
}

export function sanitizePhoneDebugMetadata(data: Record<string, unknown> = {}) {
  return sanitizeValue(data) as Record<string, unknown>;
}

export function logPhoneDebug(tag: string, data: Record<string, unknown> = {}) {
  if (!IMPORTANT_PHONE_DEBUG_TAGS.has(tag)) return;

  const sanitized = sanitizePhoneDebugMetadata(data);
  const callSid = String(
    sanitized.activeCallSid ||
      sanitized.callSid ||
      sanitized.sid ||
      sanitized.twilioCallSid ||
      "",
  ) || null;
  const parentCallSid = String(sanitized.parentCallSid || "") || null;
  const traceGroup = String(sanitized.traceGroup || parentCallSid || callSid || "") || null;

  void supabase.functions.invoke("phone-debug-log", {
    body: {
      eventKind: tag,
      severity: tag.includes("error") || tag.includes("failed") ? "error" : "info",
      summary: `Softphone ${tag}`,
      callSid,
      parentCallSid,
      traceGroup,
      metadata: sanitized,
    },
  }).catch(() => {
    // Debug logging should never affect a phone call.
  });
}
