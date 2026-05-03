import { supabase } from "@/integrations/supabase/client";

type SystemErrorSeverity = "info" | "warning" | "error" | "critical";

type ClientSystemError = {
  sourceName: string;
  message: string;
  severity?: SystemErrorSeverity;
  context?: Record<string, unknown>;
  sourceType?: string;
  stackTrace?: string | null;
  httpStatus?: number | null;
};

let browserLoggingInstalled = false;
const recentClientErrors = new Map<string, number>();

function truncate(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactContext(context: Record<string, unknown>) {
  const compacted: Record<string, unknown> = {};

  Object.entries(context).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null || typeof value === "number" || typeof value === "boolean") {
      compacted[key] = value;
      return;
    }
    if (typeof value === "string") {
      compacted[key] = truncate(value, 1000);
      return;
    }

    try {
      compacted[key] = JSON.parse(truncate(JSON.stringify(value), 2500));
    } catch {
      compacted[key] = truncate(value, 1000);
    }
  });

  return compacted;
}

function browserContext() {
  if (typeof window === "undefined") return {};

  return {
    path: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    href: truncate(window.location.href, 1200),
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    user_agent: typeof navigator !== "undefined" ? truncate(navigator.userAgent, 600) : null,
    viewport:
      typeof window.innerWidth === "number"
        ? `${window.innerWidth}x${window.innerHeight}`
        : null,
  };
}

function shouldSkipDuplicate(sourceName: string, message: string) {
  const key = `${sourceName}:${message.slice(0, 300)}`;
  const now = Date.now();
  const last = recentClientErrors.get(key) || 0;
  if (now - last < 5000) return true;
  recentClientErrors.set(key, now);
  return false;
}

export async function logClientSystemError({
  sourceName,
  message,
  severity = "error",
  context = {},
  sourceType = "client",
  stackTrace = null,
  httpStatus = null,
}: ClientSystemError) {
  try {
    const safeMessage = truncate(message || "Unknown client error", 1200);
    if (shouldSkipDuplicate(sourceName, safeMessage)) return;

    await supabase.rpc("log_system_error", {
      p_source_type: sourceType,
      p_source_name: sourceName,
      p_error_message: safeMessage,
      p_severity: severity,
      p_stack_trace: stackTrace ? truncate(stackTrace, 8000) : null,
      p_context: compactContext({
        ...browserContext(),
        ...context,
        client_logged_at: new Date().toISOString(),
      }),
      p_http_status: httpStatus,
    });
  } catch (error) {
    console.warn("[system-error-log] could not write client error", error);
  }
}

function reasonToError(reason: unknown) {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string") return new Error(reason);

  try {
    return new Error(JSON.stringify(reason));
  } catch {
    return new Error(String(reason ?? "Unhandled promise rejection"));
  }
}

export function installClientErrorLogging() {
  if (browserLoggingInstalled || typeof window === "undefined") return;
  browserLoggingInstalled = true;

  window.addEventListener("error", (event) => {
    const message = event.error?.message || event.message || "Browser error";
    void logClientSystemError({
      sourceName: "browser-window-error",
      message,
      severity: "error",
      stackTrace: event.error?.stack || null,
      context: {
        filename: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const error = reasonToError(event.reason);
    void logClientSystemError({
      sourceName: "browser-unhandled-rejection",
      message: error.message || "Unhandled promise rejection",
      severity: "error",
      stackTrace: error.stack || null,
      context: {
        reason_type: typeof event.reason,
      },
    });
  });
}
