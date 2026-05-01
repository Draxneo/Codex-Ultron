import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logSystemTrace } from "../_shared/systemTrace.ts";
import { recentOutboundExists, sendIvrSms } from "../_shared/smsHelper.ts";
import { resolveSmsTemplateBody } from "../_shared/smsTemplates.ts";

const MISSED_STATUSES = new Set(["canceled", "no-answer", "failed", "busy"]);

function last10(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "").slice(-10);
}

async function findBestCallRow(supabase: any, sids: string[], phone: string) {
  const cleanSids = [...new Set(sids.filter(Boolean))];
  if (cleanSids.length) {
    const { data: directRows } = await supabase
      .from("call_log")
      .select("id, twilio_sid, direction, phone_number, contact_name, contact_type, status, extracted_data")
      .in("twilio_sid", cleanSids)
      .order("created_at", { ascending: true });

    const rows = directRows || [];
    const withIvr = rows.find((row: any) => row?.extracted_data?.ivr_digit);
    if (withIvr) return withIvr;
    if (rows[0]) return rows[0];
  }

  const phoneDigits = last10(phone);
  if (!phoneDigits) return null;

  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: recentRows } = await supabase
    .from("call_log")
    .select("id, twilio_sid, direction, phone_number, contact_name, contact_type, status, extracted_data, created_at")
    .eq("direction", "inbound")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  return (recentRows || []).find((row: any) =>
    last10(row.phone_number) === phoneDigits &&
    (row.extracted_data?.ivr_digit || ["ringing", "initiated", "in-progress"].includes(row.status))
  ) || null;
}

async function maybeSendCanvasMissedSms({
  supabase,
  callRow,
  status,
}: {
  supabase: any;
  callRow: any;
  status: string;
}) {
  if (!MISSED_STATUSES.has(status)) return;
  if (callRow.direction !== "inbound") return;

  const extracted = (callRow.extracted_data || {}) as Record<string, any>;
  if (callRow.status === "suspected-bot") return;
  if (extracted.overflow_to) return;

  const phoneNumber = callRow.phone_number || "";
  if (!phoneNumber) return;

  const recent = await recentOutboundExists(supabase, phoneNumber, 30);
  if (recent) {
    await logSystemTrace({
      sourceType: "voice",
      sourceName: "phone-call-terminal",
      eventKind: "sms_skipped",
      summary: "Softphone missed-call SMS skipped",
      reason: "recent_outbound_sms",
      severity: "info",
      traceGroup: callRow.twilio_sid,
      entityType: "call",
      entityId: callRow.id,
      callSid: callRow.twilio_sid,
      metadata: { phone_last4: last10(phoneNumber).slice(-4) },
    });
    return;
  }

  const chosenDigit = extracted.ivr_digit ? String(extracted.ivr_digit) : "1";
  const { data: deptOption } = await supabase
    .from("ivr_menu_options")
    .select("label, dept_no_vm_missed_call_sms, dept_no_vm_missed_call_sms_enabled, dept_missed_call_sms, dept_missed_call_sms_template_key")
    .eq("digit", chosenDigit)
    .eq("is_active", true)
    .maybeSingle();

  const enabled = deptOption?.dept_no_vm_missed_call_sms_enabled !== false;
  const fallbackBody = (deptOption?.dept_no_vm_missed_call_sms || deptOption?.dept_missed_call_sms || "").trim();
  if (!enabled || (!fallbackBody && !deptOption?.dept_missed_call_sms_template_key)) {
    await logSystemTrace({
      sourceType: "voice",
      sourceName: "phone-call-terminal",
      eventKind: "sms_skipped",
      summary: "Softphone missed-call SMS skipped",
      reason: !enabled ? "department_sms_disabled" : "empty_department_sms",
      severity: "warning",
      traceGroup: callRow.twilio_sid,
      entityType: "call",
      entityId: callRow.id,
      callSid: callRow.twilio_sid,
      metadata: { ivr_digit: chosenDigit, department: deptOption?.label || null },
    });
    return;
  }

  const resolvedTemplate = await resolveSmsTemplateBody({
    supabase,
    templateKey: deptOption?.dept_missed_call_sms_template_key,
    fallbackBody,
    extraVars: { customer_name: callRow.contact_name || "" },
  });

  await sendIvrSms({
    to: phoneNumber,
    body: resolvedTemplate.body,
    contactName: callRow.contact_name || null,
    contactType: callRow.contact_type || "unknown",
    supabase,
    skipEmployeeFilter: true,
    sourceFunction: "phone-call-terminal",
    templateKey: resolvedTemplate.templateKey,
  });

  await logSystemTrace({
    sourceType: "voice",
    sourceName: "phone-call-terminal",
    eventKind: "sms_sent",
    summary: "Softphone missed-call SMS sent from IVR canvas",
    reason: "ivr_canvas_per_dept",
    severity: "info",
    traceGroup: callRow.twilio_sid,
    entityType: "call",
    entityId: callRow.id,
    callSid: callRow.twilio_sid,
    metadata: {
      ivr_digit: chosenDigit,
      department: deptOption?.label || null,
      template_key: resolvedTemplate.templateKey || null,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const status = String(body.status || "").toLowerCase();
    const sids = [
      String(body.callSid || ""),
      String(body.parentCallSid || ""),
      ...((Array.isArray(body.sids) ? body.sids : []) as string[]),
    ];
    const phone = String(body.phone || body.from || body.customerNumber || "");

    if (!status) {
      return new Response(JSON.stringify({ error: "Missing status" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callRow = await findBestCallRow(supabase, sids, phone);
    if (!callRow) {
      await logSystemTrace({
        sourceType: "voice",
        sourceName: "phone-call-terminal",
        eventKind: "terminal_row_missing",
        summary: "Softphone terminal event could not find a call row",
        reason: status,
        severity: "warning",
        traceGroup: sids.find(Boolean) || null,
        entityType: "call",
        entityId: sids.find(Boolean) || null,
        callSid: sids.find(Boolean) || null,
        metadata: { phone_last4: last10(phone).slice(-4), status },
      });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = (callRow.extracted_data || {}) as Record<string, unknown>;
    const childSids = [...new Set([...((Array.isArray((extracted as any).child_call_sids) ? (extracted as any).child_call_sids : []) as string[]), ...sids.filter(Boolean)])];
    await supabase
      .from("call_log")
      .update({
        status,
        ended_at: new Date().toISOString(),
        extracted_data: {
          ...extracted,
          child_call_sids: childSids,
          latest_softphone_terminal_status: status,
          latest_softphone_terminal_at: new Date().toISOString(),
        },
      })
      .eq("id", callRow.id);

    await logSystemTrace({
      sourceType: "voice",
      sourceName: "phone-call-terminal",
      eventKind: "terminal_reconciled",
      summary: `Softphone terminal event reconciled to ${status}`,
      reason: status,
      severity: MISSED_STATUSES.has(status) ? "warning" : "info",
      traceGroup: callRow.twilio_sid,
      entityType: "call",
      entityId: callRow.id,
      callSid: callRow.twilio_sid,
      metadata: {
        phone_last4: last10(phone || callRow.phone_number).slice(-4),
        ivr_digit: (callRow.extracted_data || {})?.ivr_digit || null,
        frontend_sids: sids.filter(Boolean),
      },
    });

    await maybeSendCanvasMissedSms({ supabase, callRow, status });

    return new Response(JSON.stringify({ ok: true, call_id: callRow.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("phone-call-terminal error:", error);
    return new Response(JSON.stringify({ error: "terminal reconcile failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
