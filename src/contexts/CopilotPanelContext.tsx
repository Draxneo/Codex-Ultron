import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errorMessage";

type JarvisRecord = Record<string, unknown>;

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * JarvisContextPayload — structured data returned by `jarvis-context-builder`.
 * Sent to `ai-task-agent` via `body.jarvis_context` so the agent can answer
 * without redoing search_customer / lookup history.
 */
export interface JarvisContextPayload {
  trigger: "call" | "sms" | "voicemail" | "job" | "estimate" | "customer" | "dispatch_card" | "phone" | "crm";
  built_at: string;
  contact: JarvisRecord | null;
  artifact: JarvisRecord;
  recent_history: { jobs: JarvisRecord[]; calls: JarvisRecord[]; sms: JarvisRecord[] };
  suggested_actions: string[];
}

interface CopilotPanelState {
  open: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  sendQuery: (query: string) => void;
  consumePendingQuery: () => string | null;
  /** Pull (and clear) the pending structured context payload */
  consumePendingContext: () => JarvisContextPayload | null;
  /** Peek at current context payload without clearing — used for one-shot send */
  peekPendingContext: () => JarvisContextPayload | null;
  startCallSession: (phone: string, contactName?: string, callSid?: string) => void;
  consumePendingCallSession: () => { phone: string; contactName?: string; callSid?: string } | null;
  activeCallPreview: { phone: string; contactName?: string } | null;
  startSmsSession: (phone: string, contactName?: string) => void;
  consumePendingSmsSession: () => { phone: string; contactName?: string } | null;
  startVoicemailSession: (voicemailId: string, phone: string, contactName?: string) => void;
  consumePendingVoicemailSession: () => { voicemailId: string; phone: string; contactName?: string } | null;
  startRecordSession: (args: {
    contextType: JarvisContextPayload["trigger"];
    contextId?: string | null;
    label?: string;
    prompt?: string;
    context?: JarvisRecord;
  }) => void;
  /** Bumps on every start*Session / sendQuery so effects can re-fire */
  pendingVersion: number;
}

const CopilotPanelContext = createContext<CopilotPanelState>({
  open: false,
  toggle: () => {},
  setOpen: () => {},
  sendQuery: () => {},
  consumePendingQuery: () => null,
  consumePendingContext: () => null,
  peekPendingContext: () => null,
  startCallSession: () => {},
  consumePendingCallSession: () => null,
  activeCallPreview: null,
  startSmsSession: () => {},
  consumePendingSmsSession: () => null,
  startVoicemailSession: () => {},
  consumePendingVoicemailSession: () => null,
  startRecordSession: () => {},
  pendingVersion: 0,
});

export function useCopilotPanel() {
  return useContext(CopilotPanelContext);
}

export function CopilotPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activeCallPreview, setActiveCallPreview] = useState<{ phone: string; contactName?: string } | null>(null);
  const [pendingVersion, setPendingVersion] = useState(0);
  const pendingQueryRef = useRef<string | null>(null);
  const pendingContextRef = useRef<JarvisContextPayload | null>(null);
  const pendingCallRef = useRef<{ phone: string; contactName?: string; callSid?: string } | null>(null);
  const pendingSmsRef = useRef<{ phone: string; contactName?: string } | null>(null);
  const pendingVoicemailRef = useRef<{ voicemailId: string; phone: string; contactName?: string } | null>(null);

  const stashContextBuilderFailure = useCallback((args: JarvisRecord, error: unknown) => {
    const trigger = (args.trigger as JarvisContextPayload["trigger"]) || "crm";
    const phone = textValue(args.phone);
    const contactName = textValue(args.contact_name);
    const message = errorMessage(error);
    pendingContextRef.current = {
      trigger,
      built_at: new Date().toISOString(),
      contact: phone || contactName ? { phone, name: contactName } : null,
      artifact: {
        type: trigger,
        label: contactName || phone || trigger,
        context_builder_status: "failed",
        context_builder_error: message,
        requested_context: args,
      },
      recent_history: { jobs: [], calls: [], sms: [] },
      suggested_actions: [
        "Tell the user the full customer context did not load",
        "Work only from the visible record and the user's instructions",
        "Ask the dispatcher to refresh before approving customer-facing actions",
      ],
    };
  }, []);

  const toggle = useCallback(() => setOpen((p) => !p), []);

  const sendQuery = useCallback((query: string) => {
    pendingQueryRef.current = query;
    setPendingVersion((v) => v + 1);
    setOpen(true);
  }, []);

  const consumePendingQuery = useCallback(() => {
    const q = pendingQueryRef.current;
    pendingQueryRef.current = null;
    return q;
  }, []);

  const consumePendingContext = useCallback(() => {
    const c = pendingContextRef.current;
    pendingContextRef.current = null;
    return c;
  }, []);

  const peekPendingContext = useCallback(() => pendingContextRef.current, []);

  /**
   * Fire-and-forget: kick off context-builder in the background and stash
   * the result so the chat panel sends it with the first user message.
   * The panel opens immediately — no await needed.
   */
  const fetchContext = useCallback(async (args: JarvisRecord) => {
    try {
      const { data, error } = await supabase.functions.invoke("jarvis-context-builder", { body: args });
      if (!error && data && !data.error) {
        pendingContextRef.current = data as JarvisContextPayload;
        return data as JarvisContextPayload;
      }
      stashContextBuilderFailure(args, error || data?.error || "Jarvis context builder returned no context");
    } catch (e) {
      console.warn("jarvis-context-builder failed", e);
      stashContextBuilderFailure(args, e);
    }
    return null;
  }, [stashContextBuilderFailure]);

  const startCallSession = useCallback((phone: string, contactName?: string, callSid?: string) => {
    pendingCallRef.current = { phone, contactName, callSid };
    setActiveCallPreview({ phone, contactName });
    pendingQueryRef.current = `Caller on the line: ${phone}${contactName ? ` (${contactName})` : ""}. Use the JARVIS context payload (already attached) — do not re-look-up. Give me a 3-line snapshot: who they are, last interaction, suggested next move.`;
    setOpen(true);
    void fetchContext({ trigger: "call", phone, contact_name: contactName, call_sid: callSid })
      .finally(() => setPendingVersion((v) => v + 1));
  }, [fetchContext]);

  const consumePendingCallSession = useCallback(() => {
    const c = pendingCallRef.current;
    pendingCallRef.current = null;
    return c;
  }, []);

  const startSmsSession = useCallback((phone: string, contactName?: string) => {
    pendingSmsRef.current = { phone, contactName };
    pendingQueryRef.current = `Texting ${phone}${contactName ? ` (${contactName})` : ""}. Use the attached JARVIS context — give me a 2-line snapshot and one suggested reply if appropriate.`;
    setOpen(true);
    void fetchContext({ trigger: "sms", phone, contact_name: contactName })
      .finally(() => setPendingVersion((v) => v + 1));
  }, [fetchContext]);

  const consumePendingSmsSession = useCallback(() => {
    const s = pendingSmsRef.current;
    pendingSmsRef.current = null;
    return s;
  }, []);


  const startVoicemailSession = useCallback((voicemailId: string, phone: string, contactName?: string) => {
    pendingVoicemailRef.current = { voicemailId, phone, contactName };
    pendingQueryRef.current = `Voicemail from ${phone}${contactName ? ` (${contactName})` : ""}. Use the attached JARVIS context (transcription included) — tell me what they need and recommend the response.`;
    setOpen(true);
    void fetchContext({ trigger: "voicemail", voicemail_id: voicemailId, phone, contact_name: contactName })
      .finally(() => setPendingVersion((v) => v + 1));
  }, [fetchContext]);

  const consumePendingVoicemailSession = useCallback(() => {
    const v = pendingVoicemailRef.current;
    pendingVoicemailRef.current = null;
    return v;
  }, []);

  const startRecordSession = useCallback((args: {
    contextType: JarvisContextPayload["trigger"];
    contextId?: string | null;
    label?: string;
    prompt?: string;
    context?: JarvisRecord;
  }) => {
    const context = args.context || {};
    const label = args.label || textValue(context.title) || textValue(context.customer_name) || args.contextId || args.contextType;
    pendingContextRef.current = {
      trigger: args.contextType,
      built_at: new Date().toISOString(),
      contact: (context.contact as JarvisRecord | undefined) || {
        id: context.customer_id || null,
        name: context.customer_name || context.customerName || null,
        phone: context.customer_phone || context.phone || null,
        address: context.address || null,
      },
      artifact: {
        id: args.contextId || context.id || null,
        type: args.contextType,
        label,
        ...context,
      },
      recent_history: {
        jobs: Array.isArray(context.recent_jobs) ? context.recent_jobs as JarvisRecord[] : [],
        calls: Array.isArray(context.recent_calls) ? context.recent_calls as JarvisRecord[] : [],
        sms: Array.isArray(context.recent_sms) ? context.recent_sms as JarvisRecord[] : [],
      },
      suggested_actions: Array.isArray(context.suggested_actions) ? context.suggested_actions.map(String) : [
        "Summarize this record",
        "Tell me the next best action",
        "Draft any needed customer or team message for human approval",
      ],
    };
    pendingQueryRef.current = args.prompt ||
      `Use the attached ${args.contextType} context for ${label}. Summarize what matters, tell me what's next, and suggest any action that needs human approval.`;
    setPendingVersion((v) => v + 1);
    setOpen(true);
  }, []);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggle]);

  return (
    <CopilotPanelContext.Provider value={{
      open, toggle, setOpen,
      sendQuery, consumePendingQuery,
      consumePendingContext, peekPendingContext,
      startCallSession, consumePendingCallSession, activeCallPreview,
      startSmsSession, consumePendingSmsSession,
      startVoicemailSession, consumePendingVoicemailSession,
      startRecordSession,
      pendingVersion,
    }}>
      {children}
    </CopilotPanelContext.Provider>
  );
}
