import { supabase } from "@/integrations/supabase/client";

type ClientSystemError = {
  sourceName: string;
  message: string;
  severity?: "info" | "warning" | "error" | "critical";
  context?: Record<string, unknown>;
};

export async function logClientSystemError({
  sourceName,
  message,
  severity = "error",
  context = {},
}: ClientSystemError) {
  try {
    await supabase.rpc("log_system_error", {
      p_source_type: "client",
      p_source_name: sourceName,
      p_error_message: message,
      p_severity: severity,
      p_stack_trace: null,
      p_context: context,
      p_http_status: null,
    });
  } catch (error) {
    console.warn("[system-error-log] could not write client error", error);
  }
}
