import { getSupabaseAdmin } from "./supabaseAdmin.ts";

type TraceInput = {
  sourceType: string;
  sourceName: string;
  eventKind: string;
  summary: string;
  reason?: string | null;
  severity?: string;
  traceGroup?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  callSid?: string | null;
  parentCallSid?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logSystemTrace(input: TraceInput) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.rpc("log_system_trace", {
      p_source_type: input.sourceType,
      p_source_name: input.sourceName,
      p_event_kind: input.eventKind,
      p_summary: input.summary,
      p_reason: input.reason ?? null,
      p_severity: input.severity ?? "info",
      p_trace_group: input.traceGroup ?? null,
      p_entity_type: input.entityType ?? null,
      p_entity_id: input.entityId ?? null,
      p_call_sid: input.callSid ?? null,
      p_parent_call_sid: input.parentCallSid ?? null,
      p_metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error("system trace logging failed:", error);
  }
}