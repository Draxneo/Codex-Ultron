import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * JarvisContextPayload — structured data returned by `jarvis-context-builder`.
 * Sent to `ai-task-agent` via `body.jarvis_context` so the agent can answer
 * without redoing search_customer / lookup history.
 */
export interface JarvisContextPayload {
  trigger: "call" | "sms" | "voicemail";
  built_at: string;
  contact: any;
  artifact: any;
  recent_history: { jobs: any[]; calls: any[]; sms: any[] };
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
  const fetchContext = useCallback(async (args: Record<string, any>) => {
    try {
      const { data, error } = await supabase.functions.invoke("jarvis-context-builder", { body: args });
      if (!error && data && !data.error) {
        pendingContextRef.current = data as JarvisContextPayload;
      }
    } catch (e) {
      console.warn("jarvis-context-builder failed", e);
    }
  }, []);

  const startCallSession = useCallback((phone: string, contactName?: string, callSid?: string) => {
    pendingCallRef.current = { phone, contactName, callSid };
    setActiveCallPreview({ phone, contactName });
    pendingQueryRef.current = `Caller on the line: ${phone}${contactName ? ` (${contactName})` : ""}. Use the JARVIS context payload (already attached) — do not re-look-up. Give me a 3-line snapshot: who they are, last interaction, suggested next move.`;
    setPendingVersion((v) => v + 1);
    setOpen(true);
    void fetchContext({ trigger: "call", phone, contact_name: contactName, call_sid: callSid });
  }, [fetchContext]);

  const consumePendingCallSession = useCallback(() => {
    const c = pendingCallRef.current;
    pendingCallRef.current = null;
    return c;
  }, []);

  const startSmsSession = useCallback((phone: string, contactName?: string) => {
    pendingSmsRef.current = { phone, contactName };
    pendingQueryRef.current = `Texting ${phone}${contactName ? ` (${contactName})` : ""}. Use the attached JARVIS context — give me a 2-line snapshot and one suggested reply if appropriate.`;
    setPendingVersion((v) => v + 1);
    setOpen(true);
    void fetchContext({ trigger: "sms", phone, contact_name: contactName });
  }, [fetchContext]);

  const consumePendingSmsSession = useCallback(() => {
    const s = pendingSmsRef.current;
    pendingSmsRef.current = null;
    return s;
  }, []);


  const startVoicemailSession = useCallback((voicemailId: string, phone: string, contactName?: string) => {
    pendingVoicemailRef.current = { voicemailId, phone, contactName };
    pendingQueryRef.current = `Voicemail from ${phone}${contactName ? ` (${contactName})` : ""}. Use the attached JARVIS context (transcription included) — tell me what they need and recommend the response.`;
    setPendingVersion((v) => v + 1);
    setOpen(true);
    void fetchContext({ trigger: "voicemail", voicemail_id: voicemailId, phone, contact_name: contactName });
  }, [fetchContext]);

  const consumePendingVoicemailSession = useCallback(() => {
    const v = pendingVoicemailRef.current;
    pendingVoicemailRef.current = null;
    return v;
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
      pendingVersion,
    }}>
      {children}
    </CopilotPanelContext.Provider>
  );
}
