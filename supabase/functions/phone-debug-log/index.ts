import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logSystemTrace } from "../_shared/systemTrace.ts";

const SENSITIVE_KEY_RE = /(token|secret|password|authorization|apikey|api_key|jwt|credential)/i;
const PHONE_RE = /^\+?\d[\d\s().-]{7,}\d$/;

function cleanValue(value: unknown, depth = 0): unknown {
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
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => cleanValue(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? "[redacted]" : cleanValue(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

function safeString(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const eventKind = safeString(body.eventKind, 80) || "softphone_event";
    const callSid = safeString(body.callSid, 80);
    const parentCallSid = safeString(body.parentCallSid, 80);
    const traceGroup = safeString(body.traceGroup, 80) || parentCallSid || callSid || userData.user.id;
    const severity = ["debug", "info", "warning", "error", "critical"].includes(body.severity)
      ? body.severity
      : "info";
    const metadata = cleanValue({
      ...(body.metadata || {}),
      logged_by_user_id: userData.user.id,
      client_received_at: new Date().toISOString(),
    }) as Record<string, unknown>;

    await logSystemTrace({
      sourceType: "voice",
      sourceName: "softphone-client",
      eventKind,
      summary: safeString(body.summary, 180) || `Softphone ${eventKind}`,
      reason: safeString(body.reason, 120),
      severity,
      traceGroup,
      entityType: "call",
      entityId: traceGroup,
      callSid,
      parentCallSid,
      metadata,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("phone-debug-log error:", error);
    return new Response(JSON.stringify({ error: "phone debug logging failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
