import { useState, useEffect, useRef, useCallback } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Device, Call } from "@twilio/voice-sdk";
import { supabase } from "@/integrations/supabase/client";
import { warmAudioContext } from "@/lib/softphoneAudio";
import { logPhoneDebug } from "@/lib/phoneDebug";
import { normalizeLast10 } from "@/lib/formatters";
import {
  addContactLookup,
  buildCustomerDisplayName,
  type ContactLookupMap,
} from "@/lib/communications";
import { useCapacitor } from "@/hooks/useCapacitor";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";
import {
  initialCallLifecycleState,
  reduceCallLifecycle,
  type ActiveCallRecord,
  type CallLifecycleEvent,
  type CallLifecycleState,
} from "@/lib/softphoneCallStateMachine";
import {
  clearStoredDialRequest,
  getStoredDialRequest,
  isElectronMain,
  notifyIncomingCallWake,
  onMainMessage,
  onPowerResume,
  sendDialToPopout,
  sendToMain,
} from "@/lib/electron";

export type SoftphoneStatus = "offline" | "registering" | "ready" | "connecting" | "ringing" | "on-call" | "error";

export interface SoftphoneState {
  status: SoftphoneStatus;
  activeCall: Call | null;
  isMuted: boolean;
  callDuration: number;
  callerInfo: { number: string; name?: string } | null;
  incomingCall: Call | null;
  waitingCall: Call | null;
  waitingCallerInfo: { number: string; name?: string } | null;
  error: string | null;
}

/**
 * Structured call-lifecycle logger.
 *
 * Every event prints with a `[CallDebug]` prefix + ISO timestamp + elapsed-since-
 * call-start (when known) so you can correlate browser console output with
 * server-side voice-status-callback logs and pinpoint exactly what disconnected
 * a call mid-conversation.
 *
 * Also persists to a module-scoped ring buffer accessible via
 * `window.__callDebugLog()` so support can dump the last 200 events after a drop.
 */
const CALL_DEBUG_BUFFER: Array<{ ts: string; tag: string; data: any }> = [];
const CALL_DEBUG_MAX = 200;
let _callStartedAt: number | null = null;
const SILENT_TWILIO_SOUND =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQQAAAAAAA==";

function callDebug(tag: string, data: Record<string, any> = {}) {
  const ts = new Date().toISOString();
  const elapsedMs = _callStartedAt ? Date.now() - _callStartedAt : null;
  const enriched = { ...data, elapsedMs };
  console.log(`[CallDebug ${ts}] ${tag}`, enriched);
  CALL_DEBUG_BUFFER.push({ ts, tag, data: enriched });
  if (CALL_DEBUG_BUFFER.length > CALL_DEBUG_MAX) CALL_DEBUG_BUFFER.shift();
  logPhoneDebug(tag, enriched);
}
function markCallStart() { _callStartedAt = Date.now(); callDebug("call.start.marked"); }
function markCallEnd() { _callStartedAt = null; }
function normalizeOutboundDialNumber(value: string): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (/^\+1\d{10}$/.test(String(value || "").trim())) return String(value).trim();
  return null;
}
if (typeof window !== "undefined") {
  (window as any).__callDebugLog = () => {
    console.table(CALL_DEBUG_BUFFER);
    return CALL_DEBUG_BUFFER;
  };
}


export function useSoftphone(enabled: boolean = true) {
  const deviceRef = useRef<Device | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactMapRef = useRef<ContactLookupMap>({});
  // Current user's employee name — written to call_log.answered_by on accept so
  // server-side isUserBusy() can correctly skip this user when routing the next
  // inbound call (preventing auto-reject / call-drop and triggering the
  // answering-service overflow path).
  const currentEmployeeNameRef = useRef<string | null>(null);
  const initializingRef = useRef(false);
  const recoveringRef = useRef(false);
  const mountedRef = useRef(true);

  // On Electron main window, NEVER register a Twilio Device.
  // The pop-out phone window is the sole call handler.
  const isElectronMainWindow = isElectronMain();
  const { isNative, platform } = useCapacitor();
  const telephony = useTelephonyMode();

  const [pendingDialNumber, setPendingDialNumber] = useState<string | null>(null);
  const [pendingContactName, setPendingContactName] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);

  const [state, setState] = useState<SoftphoneState>({
    status: "offline",
    activeCall: null,
    isMuted: false,
    callDuration: 0,
    callerInfo: null,
    incomingCall: null,
    waitingCall: null,
    waitingCallerInfo: null,
    error: null,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const localAnsweredRef = useRef(false);
  const incomingCallSidRef = useRef<string | null>(null);
  const lifecycleRef = useRef<CallLifecycleState>(initialCallLifecycleState);
  // statusRef mirrors state.status so event listeners (registered once on the
  // Twilio Device) can read the latest status without capturing a stale closure.
  // Fixes the "second incoming call while on-call" decision being made against
  // a stale snapshot from when the listener was first attached.
  const statusRef = useRef<SoftphoneStatus>("offline");
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  const dispatchLifecycle = useCallback((event: CallLifecycleEvent) => {
    const previous = lifecycleRef.current;
    const transition = reduceCallLifecycle(previous, event);
    lifecycleRef.current = transition.state;
    callDebug("state.transition", {
      event: event.type,
      previousState: previous.appState,
      nextState: transition.state.appState,
      effects: transition.effects,
      activeCallSid: transition.state.activeCall?.activeCallSid || null,
      parentCallSid: transition.state.activeCall?.parentCallSid || null,
      childCallSid: transition.state.activeCall?.childCallSid || null,
      direction: transition.state.activeCall?.direction || null,
      platform: "electron",
    });
    return transition;
  }, []);

  const buildCallRecord = useCallback((call: Call, direction: "inbound" | "outbound", phone?: string | null): Partial<ActiveCallRecord> => ({
    twilioCallSid: call.parameters?.CallSid || null,
    parentCallSid: call.parameters?.ParentCallSid || null,
    childCallSid: direction === "inbound" ? (call.parameters?.CallSid || null) : null,
    activeCallSid: call.parameters?.CallSid || call.parameters?.ParentCallSid || null,
    direction,
    platform: isElectronMainWindow ? "electron" : "web",
    customerNumber: phone || call.parameters?.From || call.parameters?.To || null,
    agentIdentity: currentEmployeeNameRef.current,
  }), [isElectronMainWindow]);

  const markPendingEndedByAgent = useCallback((call: Call | null) => {
    const sids = [call?.parameters?.ParentCallSid, call?.parameters?.CallSid].filter(Boolean) as string[];
    if (!sids.length) return;

    (async () => {
      const { data: rows, error } = await supabase
        .from("call_log")
        .select("id, extracted_data")
        .in("twilio_sid", sids)
        .limit(1);
      if (error || !rows?.[0]) {
        if (error) console.error("[Softphone] pendingEndedBy lookup failed:", error);
        return;
      }

      const extracted = ((rows[0] as any).extracted_data || {}) as Record<string, unknown>;
      const { error: updateError } = await supabase
        .from("call_log")
        .update({
          extracted_data: {
            ...extracted,
            pending_ended_by: "agent",
            pending_ended_by_at: new Date().toISOString(),
          },
        })
        .eq("id", rows[0].id);
      if (updateError) console.error("[Softphone] pendingEndedBy update failed:", updateError);
    })();
  }, []);

  // Safety timeout — reset stuck connecting/ringing states
  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const startSafetyTimer = useCallback(() => {
    clearSafetyTimer();
    safetyTimerRef.current = setTimeout(() => {
      setState((s) => {
        if (s.status === "connecting" || s.status === "ringing") {
          console.warn("Softphone safety timeout — resetting to ready");
          sendToMain('call-status-change', 'ready');
          return { ...s, status: deviceRef.current ? "ready" : "offline", activeCall: null, incomingCall: null, callerInfo: null, isMuted: false, callDuration: 0 };
        }
        return s;
      });
    }, 45000);
  }, [clearSafetyTimer]);

  // Helper to fully reset call state
  const resetCallState = useCallback(() => {
    clearSafetyTimer();
    dispatchLifecycle({ type: "RESET_TO_READY" });
    sendToMain('call-status-change', 'ready');
    setState((s) => ({
      ...s,
      activeCall: null,
      incomingCall: null,
      callerInfo: null,
      isMuted: false,
      callDuration: 0,
      error: null,
      status: deviceRef.current ? "ready" : "offline",
    }));
  }, [clearSafetyTimer, dispatchLifecycle]);

  // Build employee-only contact map (small table, ~10 rows) AND resolve the
  // current user's employee name once for answered_by attribution.
  //
  // FIX (2026-04-24): The legacy code only set currentEmployeeNameRef when an
  // employees row had profile_id linked to auth.user.id. Many real users have
  // no employees row OR an unlinked profile_id, leaving the ref null and the
  // answered_by field silently dropped from every call_log row. That broke
  // server-side isUserBusy() so the 2nd inbound call kept ringing the same
  // user instead of overflowing to the answering service. We now fall back
  // through profile.full_name → email-prefix so the ref is ALWAYS populated.
  useEffect(() => {
    if (isElectronMainWindow || !enabled) return;

    const buildEmployeeMap = async () => {
      const map: ContactLookupMap = {};
      const { data: employees } = await supabase
        .from("employees")
        .select("name, phone, is_active, profile_id");

      const { data: authData } = await supabase.auth.getUser();
      const myProfileId = authData?.user?.id || null;
      const myEmail = authData?.user?.email || null;

      let resolvedEmployeeName: string | null = null;

      for (const emp of employees || []) {
        if (emp.is_active && myProfileId && (emp as any).profile_id === myProfileId) {
          resolvedEmployeeName = emp.name;
        }
        if (!emp.phone || !emp.is_active) continue;
        addContactLookup(map, emp.phone, { name: emp.name, type: "employee" }, { overwrite: true });
      }

      // Fallback 1: match the profile's full_name against an employee name
      if (!resolvedEmployeeName && myProfileId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", myProfileId)
          .maybeSingle();
        const profileName = (profile?.full_name || "").trim();
        if (profileName) {
          const norm = profileName.toLowerCase();
          const match = (employees || []).find(
            (e: any) => e.is_active && (e.name || "").toLowerCase() === norm
          );
          resolvedEmployeeName = match?.name || profileName;
        }
      }

      // Fallback 2: email prefix (e.g. clint@... → "clint" then case-insensitive
      // first-name match against employees)
      if (!resolvedEmployeeName && myEmail) {
        const prefix = myEmail.split("@")[0]?.toLowerCase() || "";
        if (prefix) {
          const match = (employees || []).find(
            (e: any) => e.is_active && (e.name || "").toLowerCase().split(" ")[0] === prefix
          );
          if (match) resolvedEmployeeName = match.name;
        }
      }

      currentEmployeeNameRef.current = resolvedEmployeeName;
      console.log("[Softphone] answered_by attribution resolved as:", resolvedEmployeeName);

      contactMapRef.current = map;
    };

    buildEmployeeMap();
  }, [enabled, isElectronMainWindow]);

  // On-demand caller ID: check employee map first, then DB lookup for customers
  const resolveCallerName = useCallback(async (phone: string): Promise<string | undefined> => {
    const key = normalizeLast10(phone);
    if (!key) return undefined;

    // Check employee map (already loaded)
    const emp = contactMapRef.current[key];
    if (emp) return emp.name;

    // DB lookup for customer (single targeted query)
    const { data: match } = await supabase
      .rpc("find_customer_by_phone", { digits: key })
      .limit(1)
      .maybeSingle();
    if (match) {
      const name = buildCustomerDisplayName(match);
      if (name) {
        // Cache for subsequent lookups in this session
        contactMapRef.current[key] = { name, type: "customer" };
        return name;
      }
    }
    return undefined;
  }, []);

  // Fetch token from edge function
  const fetchToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const body = isNative && (platform === "android" || platform === "ios")
      ? JSON.stringify({ platform })
      : undefined;

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body,
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Failed to fetch token");
    }

    const { token } = await resp.json();
    return token;
  }, [isNative, platform]);

  // Start call duration timer
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState((s) => ({ ...s, callDuration: 0 }));
    timerRef.current = setInterval(() => {
      setState((s) => ({ ...s, callDuration: s.callDuration + 1 }));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearTokenRefreshTimer = useCallback(() => {
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
  }, []);

  const getDeviceLifecycleState = useCallback((device?: Device | null) => {
    if (!device) return "missing";
    return (device as any).state || (device as any).status?.() || "unknown";
  }, []);

  const refreshDeviceToken = useCallback(async (reason: string, targetDevice?: Device | null) => {
    const device = targetDevice ?? deviceRef.current;
    if (!device || !mountedRef.current) return false;

    const initialState = getDeviceLifecycleState(device);
    if (initialState === "destroyed") {
      if (deviceRef.current === device) {
        deviceRef.current = null;
      }
      return false;
    }

    try {
      const inCall = _callStartedAt !== null;
      callDebug("token.refresh.start", { reason, inCall });
      console.log(`[Softphone] Refreshing token (${reason}) inCall=${inCall}`);
      const freshToken = await fetchToken();
      if (!freshToken) throw new Error("Unable to refresh voice token");

      if (!mountedRef.current) return false;

      const liveState = getDeviceLifecycleState(device);
      if (liveState === "destroyed") {
        callDebug("token.refresh.skip-destroyed", { reason });
        if (deviceRef.current === device) {
          deviceRef.current = null;
        }
        return false;
      }

      if (deviceRef.current && deviceRef.current !== device) {
        callDebug("token.refresh.skip-stale-device", { reason });
        return false;
      }

      device.updateToken(freshToken);
      callDebug("token.refresh.success", { reason });
      setState((s) => ({ ...s, error: null }));
      return true;
    } catch (err) {
      callDebug("token.refresh.failed", { reason, message: (err as Error)?.message });
      console.error(`[Softphone] Token refresh failed (${reason}):`, err);
      return false;
    }
  }, [fetchToken, getDeviceLifecycleState]);

  const scheduleTokenRefresh = useCallback((targetDevice?: Device | null) => {
    clearTokenRefreshTimer();
    const device = targetDevice ?? deviceRef.current;
    if (!device) return;

    tokenRefreshTimerRef.current = setTimeout(() => {
      void refreshDeviceToken("50-minute timer", device);
    }, 50 * 60 * 1000);
  }, [clearTokenRefreshTimer, refreshDeviceToken]);

  const safeRegisterDevice = useCallback(async (device: Device, reason: string) => {
    if (!mountedRef.current) return false;

    const liveState = getDeviceLifecycleState(device);
    if (liveState === "destroyed") {
      if (deviceRef.current === device) {
        deviceRef.current = null;
      }
      return false;
    }

    if (liveState === "registered") {
      setState((s) => ({
        ...s,
        status: s.activeCall || s.incomingCall ? s.status : "ready",
        error: null,
      }));
      return true;
    }

    try {
      await device.register();
      return true;
    } catch (err) {
      console.error(`[Softphone] Register failed (${reason}):`, err);
      return false;
    }
  }, [getDeviceLifecycleState]);

  // Wire disconnect/cancel/reject handlers on any call
  const wireCallEndHandlers = useCallback((call: Call) => {
    // Best-effort terminal write so an unanswered/canceled outbound never
    // gets stuck without an ended_at. The voice-status-callback webhook is
    // authoritative — this is a fallback if the webhook is delayed/missed.
    const writeTerminal = (status: "canceled" | "no-answer" | "completed") => {
      const sids = [call.parameters?.CallSid, call.parameters?.ParentCallSid].filter(Boolean) as string[];
      if (!sids.length) return;
      const phone = call.parameters?.From || call.parameters?.To || "";
      void supabase.functions.invoke("phone-call-terminal", {
        body: {
          status,
          sids,
          callSid: call.parameters?.CallSid || null,
          parentCallSid: call.parameters?.ParentCallSid || null,
          direction: call.direction,
          phone,
        },
      }).catch(() => {
        // Phone cleanup is best-effort; never disturb the user's call UI.
      });
      supabase
        .from("call_log")
        .update({ status, ended_at: new Date().toISOString() })
        .in("twilio_sid", sids)
        // Only patch rows still in a non-terminal state — don't overwrite a
        // successful "completed" recorded by the webhook with our guess.
        .in("status", ["initiated", "ringing", "in-progress"])
        .then(({ error }) => {
          if (error) console.error(`[Softphone] terminal write (${status}) failed:`, error);
        });
    };

    const onEnd = () => {
      stopTimer();
      clearSafetyTimer();
      // Always clear the SID ref — prevents stale references when caller
      // hangs up before we answer (was leaking across calls).
      incomingCallSidRef.current = null;
      localAnsweredRef.current = false;
      resetCallState();
    };
    call.on("disconnect", () => {
      dispatchLifecycle({ type: "REMOTE_ENDED", status: "completed" });
      const sids = [call.parameters?.CallSid, call.parameters?.ParentCallSid].filter(Boolean);
      callDebug("call.disconnect", {
        sids,
        from: call.parameters?.From,
        to: call.parameters?.To,
        direction: call.direction,
        // Twilio call status at the moment of disconnect
        twilioStatus: (call as any).status?.(),
        // Quality metrics if available (jitter / rtt / packet loss spikes are the
        // usual culprits for mid-call drops on flaky wifi/4G)
        codec: (call as any).codec,
      });
      // Outbound call that was answered → "completed". For never-answered
      // outbound, the cancel/error handlers below run instead.
      writeTerminal("completed");
      markCallEnd();
      onEnd();
    });
    call.on("cancel", () => {
      dispatchLifecycle({ type: "REMOTE_ENDED", status: "canceled" });
      callDebug("call.cancel", { sid: call.parameters?.CallSid });
      writeTerminal("canceled");
      markCallEnd();
      onEnd();
    });
    call.on("reject", () => {
      dispatchLifecycle({ type: "REMOTE_ENDED", status: "no-answer" });
      callDebug("call.reject", { sid: call.parameters?.CallSid });
      writeTerminal("no-answer");
      markCallEnd();
      onEnd();
    });
    call.on("error", (err) => {
      dispatchLifecycle({ type: "CALL_FAILED", error: err?.message || "Call error" });
      callDebug("call.error", {
        sid: call.parameters?.CallSid,
        code: (err as any)?.code,
        name: err?.name,
        message: err?.message,
        causes: (err as any)?.causes,
        explanation: (err as any)?.explanation,
        solutions: (err as any)?.solutions,
      });
      console.error("Call error:", err);
      // Suppress transport/ogging errors that naturally occur after disconnect
      const msg = err.message || "";
      const isTransient = /transport|ogging|ogged|websocket|ice/i.test(msg);
      if (isTransient) {
        // Don't show transient transport errors to user, just reset state
        markCallEnd();
        onEnd();
        return;
      }
      writeTerminal("no-answer");
      stopTimer();
      clearSafetyTimer();
      incomingCallSidRef.current = null;
      markCallEnd();
      setState((s) => ({
        ...s,
        activeCall: null,
        incomingCall: null,
        status: deviceRef.current ? "ready" : "offline",
        error: msg,
      }));
    });

    // Twilio Call also emits these — surface them so we can see WHEN audio
    // quality degraded vs when it actually disconnected.
    try {
      (call as any).on?.("warning", (warningName: string, warningData: any) => {
        callDebug("call.warning", { sid: call.parameters?.CallSid, warningName, warningData });
      });
      (call as any).on?.("warning-cleared", (warningName: string) => {
        callDebug("call.warning-cleared", { sid: call.parameters?.CallSid, warningName });
      });
      (call as any).on?.("reconnecting", (err: any) => {
        dispatchLifecycle({ type: "RECONNECTING" });
        callDebug("call.reconnecting", { sid: call.parameters?.CallSid, message: err?.message, code: err?.code });
      });
      (call as any).on?.("reconnected", () => {
        dispatchLifecycle({ type: "RECONNECTED" });
        callDebug("call.reconnected", { sid: call.parameters?.CallSid });
      });
      (call as any).on?.("accept", () => {
        markCallStart();
        callDebug("call.accept", { sid: call.parameters?.CallSid, direction: call.direction });
      });
      (call as any).on?.("ringing", (hasEarlyMedia: boolean) => {
        callDebug("call.ringing", { sid: call.parameters?.CallSid, hasEarlyMedia });
      });
    } catch (e) {
      console.warn("[CallDebug] failed to wire extended call listeners", e);
    }
  }, [stopTimer, clearSafetyTimer, resetCallState, dispatchLifecycle]);

  // Initialize device
  // Pre-request microphone permission so Android WebView grants it before Twilio needs it
  const ensureMicPermission = useCallback(async () => {
    // Retry up to 3 times — Android Capacitor WebView sometimes fails on cold start
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop tracks immediately — we just needed the permission grant
        stream.getTracks().forEach((t) => t.stop());
        return true;
      } catch (err: any) {
        console.warn(`Microphone permission attempt ${attempt + 1} failed:`, err?.name, err?.message);
        // NotAllowedError = user denied; NotFoundError = no mic; other errors may be transient
        if (err?.name === "NotAllowedError" && attempt < 2) {
          // Wait a moment and retry — Android WebView sometimes needs time after app resume
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        if (err?.name === "NotFoundError") {
          console.error("No microphone device found");
          return false;
        }
        // On final attempt, give up
        if (attempt === 2) return false;
      }
    }
    return false;
  }, []);

  const initialize = useCallback(async () => {
    if (initializingRef.current) return;

    const existingDevice = deviceRef.current;
    const existingState = getDeviceLifecycleState(existingDevice);
    if (existingDevice && existingState !== "destroyed") return;
    if (existingDevice && existingState === "destroyed") {
      deviceRef.current = null;
    }

    initializingRef.current = true;

    try {
      dispatchLifecycle({ type: "DEVICE_REGISTERING" });
      setState((s) => ({ ...s, status: "registering", error: null }));

      // Pre-warm audio context while we have user-gesture context (mic permission tap)
      warmAudioContext();

      // Request mic permission early — Android Capacitor WebView requires this
      const micAllowed = await ensureMicPermission();
      if (!micAllowed) {
        setState((s) => ({ ...s, status: "error", error: "Microphone permission denied. Please allow microphone access in your device settings." }));
        initializingRef.current = false;
        return;
      }

      const token = await fetchToken();
      if (!token) {
        setState((s) => ({ ...s, status: "offline", error: "Not authenticated" }));
        initializingRef.current = false;
        return;
      }

      if (deviceRef.current) {
        const staleDevice = deviceRef.current;
        deviceRef.current = null;
        try { (staleDevice as any).removeAllListeners?.(); } catch { /* noop */ }
        try { staleDevice.destroy(); } catch { /* noop */ }
      }

      const device = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        closeProtection: true,
        allowIncomingWhileBusy: true,
        tokenRefreshMs: 10 * 60 * 1000,
        sounds: {
          incoming: SILENT_TWILIO_SOUND,
          outgoing: SILENT_TWILIO_SOUND,
          disconnect: SILENT_TWILIO_SOUND,
        },
      });

      deviceRef.current = device;
      try {
        device.audio?.incoming(false);
        device.audio?.outgoing(false);
        device.audio?.disconnect(false);
      } catch (audioErr) {
        console.warn("[Softphone] Could not disable Twilio built-in sounds:", audioErr);
      }

      device.on("registered", () => {
        dispatchLifecycle({ type: "DEVICE_READY" });
        callDebug("device.registered");
        scheduleTokenRefresh(device);
        setState((s) => ({ ...s, status: "ready", error: null }));
      });
      device.on("unregistered", () => callDebug("device.unregistered", { inCall: _callStartedAt !== null }));
      device.on("tokenWillExpire", () => callDebug("device.tokenWillExpire", { inCall: _callStartedAt !== null }));
      device.on("destroyed", () => callDebug("device.destroyed", { inCall: _callStartedAt !== null }));

      device.on("error", (err) => {
        callDebug("device.error", {
          code: (err as any)?.code,
          name: err?.name,
          message: err?.message,
          inCall: _callStartedAt !== null,
        });
        console.error("Twilio Device error:", err);
        const msg = err.message || "";
        if (/AccessTokenExpired|token.*expired|jwt.*expired/i.test(msg)) {
          setTimeout(async () => {
            const d = deviceRef.current;
            if (!d) return;
            try {
              console.warn("[Softphone] Token expired — fetching fresh token + re-registering");
              const refreshed = await refreshDeviceToken("expired token", d);
              if (!refreshed) throw new Error("Unable to refresh voice token");
              try { d.unregister(); } catch { /* noop */ }
              await d.register();
              scheduleTokenRefresh(d);
              setState((s) => ({ ...s, status: "ready", error: null }));
            } catch (refreshErr: any) {
              console.error("[Softphone] Token refresh recovery failed:", refreshErr);
              try { d.destroy(); } catch { /* noop */ }
              deviceRef.current = null;
              setState((s) => ({ ...s, status: "offline", error: refreshErr?.message || msg }));
            }
          }, 250);
          return;
        }
        // Transport-layer errors are common (mobile/wifi switching, brief disconnects).
        // Don't surface them in the UI, but DO try to re-register so the Device
        // doesn't silently stay dead and miss incoming calls.
        if (/transport|ogging|websocket|ice|offline/i.test(msg)) {
          setTimeout(() => {
            const d = deviceRef.current;
            if (!d) return;
            const st = (d as any).state || (d as any).status?.();
            if (st !== "registered" && st !== "destroyed") {
              console.warn("[Softphone] Transport error — re-registering Device");
              void safeRegisterDevice(d, "transport error");
            }
          }, 1500);
          return;
        }
        dispatchLifecycle({ type: "DEVICE_ERROR", error: msg });
        setState((s) => ({ ...s, status: "error", error: msg }));
      });

      device.on("incoming", async (call: Call) => {
        const from = call.parameters?.From || "Unknown";
        const inviteTransition = dispatchLifecycle({
          type: "INBOUND_INVITE",
          call: buildCallRecord(call, "inbound", from),
        });

        // ── Auto-reject 2nd calls while on a live call ──
        // Server-side routing should prevent this from happening, but if a 2nd
        // call slips through (race), reject immediately so no audio leaks
        // into the active conversation. No call-waiting toast, no swap UI.
        // Read LATEST status from ref (not the stale closure captured when
        // the listener was registered).
        const currentStatus = statusRef.current;
        if (
          inviteTransition.effects.includes("reject_duplicate_inbound") ||
          currentStatus === "on-call" ||
          currentStatus === "connecting" ||
          currentStatus === "ringing" ||
          incomingCallSidRef.current
        ) {
          console.log("[Softphone] Auto-rejecting duplicate inbound call", {
            currentStatus,
            existingIncomingSid: incomingCallSidRef.current,
          });
          try { call.reject(); } catch { /* noop */ }
          return;
        }

        const resolvedName = await resolveCallerName(from);

        setState((s) => {
          // Defensive guard: if state changed mid-await to on-call, reject here too
          if (s.status === "on-call" || s.status === "connecting" || s.status === "ringing" || s.incomingCall) {
            try { call.reject(); } catch { /* noop */ }
            return s;
          }

          // Normal ringing
          sendToMain('call-status-change', 'ringing');
          // Wake the screen / pop the phone window / OS beep (Electron only)
          const launchTargets = telephony.getSurfaceLaunchTargets("calls");
          notifyIncomingCallWake({
            shouldLaunchUltraphone: false,
            appUrl: launchTargets.appUrl,
            webUrl: launchTargets.webUrl,
          });
          return {
            ...s,
            incomingCall: call,
            callerInfo: { number: from, name: resolvedName },
            status: "ringing" as SoftphoneStatus,
          };
        });

        // Track incoming call SID for cross-device sync
        const incomingSid = call.parameters?.CallSid || null;
        incomingCallSidRef.current = incomingSid;
        localAnsweredRef.current = false;

        // Insert a call_log row only if the server-side webhook hasn't already
        // created one. The webhook has richer enrichment (vendor matching,
        // CNAM, STIR status) — overwriting it with our partial client-side
        // resolution would clobber that data.
        if (incomingSid) {
          (async () => {
            const { data: existing } = await supabase
              .from("call_log")
              .select("id, contact_name, contact_type")
              .eq("twilio_sid", incomingSid)
              .maybeSingle();

            if (!existing) {
              await supabase
                .from("call_log")
                .insert({
                  twilio_sid: incomingSid,
                  phone_number: from,
                  direction: "inbound",
                  status: "ringing",
                  contact_name: resolvedName || null,
                  contact_type: resolvedName ? "customer" : "unknown",
                  created_at: new Date().toISOString(),
                });
            } else if (resolvedName && !existing.contact_name) {
              // Only fill in name if webhook left it null
              await supabase
                .from("call_log")
                .update({
                  contact_name: resolvedName,
                  contact_type: existing.contact_type === "unknown" ? "customer" : existing.contact_type,
                })
                .eq("id", existing.id);
            }
          })();
        }

        // Wire accept event on incoming call — drives on-call state transition
        call.on("accept", () => {
          dispatchLifecycle({
            type: "REMOTE_ANSWERED",
            twilioCallSid: call.parameters?.CallSid || null,
            parentCallSid: call.parameters?.ParentCallSid || null,
            childCallSid: call.parameters?.CallSid || null,
          });
          localAnsweredRef.current = true;
          clearSafetyTimer();
          sendToMain('call-status-change', 'on-call');
          setState((s) => ({
            ...s,
            activeCall: call,
            incomingCall: null,
            status: "on-call",
          }));
          startTimer();

          // Update call_log to "in-progress" so the DB reflects the answered state
          const twilioSid = call.parameters?.CallSid;
          if (twilioSid) {
            supabase
              .from("call_log")
              .update({ status: "in-progress", started_at: new Date().toISOString(), ...(currentEmployeeNameRef.current ? { answered_by: currentEmployeeNameRef.current } : {}) })
              .eq("twilio_sid", twilioSid)
              .then(({ error }) => {
                if (error) console.error("Failed to update call_log to in-progress:", error);
              });
          }
        });

        // Call-waiting beep removed — 2nd inbound calls are auto-rejected above.

        startSafetyTimer();
        wireCallEndHandlers(call);
      });

      device.on("unregistered", () => {
        console.warn("[Softphone] Device unregistered — attempting recovery");
        clearTokenRefreshTimer();
        setState((s) => ({
          ...s,
          status: s.activeCall || s.incomingCall ? s.status : "offline",
        }));
        setTimeout(() => {
          const d = deviceRef.current;
          if (!d) return;
          void safeRegisterDevice(d, "unregistered event");
        }, 500);
      });

      device.on("tokenWillExpire", async () => {
        const refreshed = await refreshDeviceToken("tokenWillExpire", device);
        if (refreshed) scheduleTokenRefresh(device);
      });

      await safeRegisterDevice(device, "initialize");
      deviceRef.current = device;
    } catch (err: any) {
      console.error("Softphone init error:", err);
      setState((s) => ({ ...s, status: "error", error: err.message }));
    } finally {
      initializingRef.current = false;
    }
  }, [buildCallRecord, clearSafetyTimer, clearTokenRefreshTimer, dispatchLifecycle, ensureMicPermission, fetchToken, getDeviceLifecycleState, refreshDeviceToken, resolveCallerName, safeRegisterDevice, scheduleTokenRefresh, startSafetyTimer, startTimer, telephony, wireCallEndHandlers]);

  // On Electron pop-out: listen for dial-number IPC from the main window
  // (dial ref isn't available yet — we use dialRef to avoid circular dependency)
  const dialRef = useRef<((n: string, c?: string) => Promise<void>) | null>(null);

  // Auto-connect on auth (skip entirely on Electron main — pop-out handles it)
  useEffect(() => {
    if (isElectronMainWindow || !enabled) return;

    const checkAndConnect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !deviceRef.current && !initializingRef.current) {
        setTimeout(() => initialize(), 2000);
      }
    };

    checkAndConnect();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && !deviceRef.current && !initializingRef.current && !isElectronMainWindow) {
        setTimeout(() => initialize(), 2000);
      } else if (event === "SIGNED_OUT") {
        if (deviceRef.current) {
          deviceRef.current.destroy();
          deviceRef.current = null;
        }
        setState({
          status: "offline",
          activeCall: null,
          isMuted: false,
          callDuration: 0,
          callerInfo: null,
          incomingCall: null,
          waitingCall: null,
          waitingCallerInfo: null,
          error: null,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [initialize, isElectronMainWindow, enabled, refreshDeviceToken, safeRegisterDevice]);

  // Re-warm audio + re-register Twilio Device after the PC wakes from sleep / unlock.
  // The WebSocket transport often dies during suspend, so we proactively re-register.
  useEffect(() => {
    if (isElectronMainWindow || !enabled) return;

    const unsubscribe = onPowerResume(() => {
      console.log("[Softphone] Power resume — re-warming audio + re-registering Twilio Device");
      try { warmAudioContext(); } catch { /* noop */ }
      const callInFlight = state.status === "ringing" ||
                           state.status === "connecting" ||
                           state.status === "on-call" ||
                           _callStartedAt !== null;
      if (callInFlight) {
        callDebug("power-resume.skip-registration-during-call", { status: state.status });
        return;
      }
      const device = deviceRef.current;
      if (!device) {
        if (!initializingRef.current) initialize();
        return;
      }
      const status = (device as any).state || (device as any).status?.();
      if (status === "destroyed") {
        if (!initializingRef.current) initialize();
        return;
      }
      if (status !== "registered") {
        void refreshDeviceToken("power resume", device).finally(() => {
          void safeRegisterDevice(device, "power resume");
        });
      }
    });

    return unsubscribe;
  }, [enabled, initialize, isElectronMainWindow, refreshDeviceToken, safeRegisterDevice, state.status]);

  // ── Registration heartbeat ──
  // The Twilio Device WebSocket can silently drop (network blip, idle disconnect,
  // swallowed transport error) and Twilio will route incoming calls elsewhere
  // while our UI still says "ready". Every 30s we check device.state and
  // re-register if it's not actually registered.
  useEffect(() => {
    if (isElectronMainWindow || !enabled) return;

    const interval = setInterval(() => {
      const device = deviceRef.current;
      if (!device) return;
      const devState = (device as any).state || (device as any).status?.();
      const inCall = state.status === "ringing" ||
                     state.status === "connecting" ||
                     state.status === "on-call" ||
                     _callStartedAt !== null;

      if (devState === "destroyed") {
        callDebug("heartbeat.device-destroyed", { inCall });
        if (inCall) return;
        console.warn("[Softphone heartbeat] Device destroyed — full re-init");
        deviceRef.current = null;
        if (!initializingRef.current) initialize();
        return;
      }

      if (devState !== "registered") {
        callDebug("heartbeat.re-register", { devState, inCall });
        if (inCall) return;
        console.warn(`[Softphone heartbeat] Device state="${devState}" inCall=${inCall} — forcing re-register`);
        void refreshDeviceToken("heartbeat", device).finally(() => {
          void safeRegisterDevice(device, "heartbeat").then((ok) => {
            callDebug("heartbeat.re-register.result", { ok, inCall });
            if (ok) return;
            try { device.destroy(); } catch { /* noop */ }
            if (deviceRef.current === device) {
              deviceRef.current = null;
            }
          });
        });
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [initialize, isElectronMainWindow, enabled, refreshDeviceToken, safeRegisterDevice, state.status]);

  /**
   * Non-destructive health check / recovery.
   *
   * Safe to call any time the phone window becomes visible/focused, after
   * power resume, or right before dialing. NEVER destroys the Device while
   * a call is active/ringing/connecting — that would drop the call.
   *
   * - If we're mid-call: re-warm audio only, return.
   * - If Device is registered: re-warm audio, return.
   * - If Device exists but is unregistered: call register().
   * - If Device is destroyed or missing: full initialize().
   */
  const recoverIfNeeded = useCallback(async () => {
    if (isElectronMainWindow || !enabled) return;
    if (recoveringRef.current) return;
    recoveringRef.current = true;

    try {
      // Always safe: re-warm audio context (browser may have suspended it)
      try { warmAudioContext(); } catch { /* noop */ }

      // Read latest status from the ref-backed setState — never tear down
      // the Device while a call is in flight.
      const inCall = state.status === "ringing" ||
                    state.status === "connecting" ||
                    state.status === "on-call";
      if (inCall) {
        console.log("[Softphone recover] Skipping — call in progress");
        return;
      }

      const device = deviceRef.current;

      // No device yet → full init
      if (!device) {
        if (!initializingRef.current) {
          console.log("[Softphone recover] No device — initializing");
          await initialize();
        }
        return;
      }

      await refreshDeviceToken("recoverIfNeeded", device);

      const devState = (device as any).state || (device as any).status?.();

      if (devState === "destroyed") {
        console.log("[Softphone recover] Device destroyed — re-initializing");
        deviceRef.current = null;
        if (!initializingRef.current) await initialize();
        return;
      }

      if (devState !== "registered") {
        console.log(`[Softphone recover] Device state="${devState}" — re-registering`);
        try {
          try { await device.unregister(); } catch { /* noop */ }
          await safeRegisterDevice(device, "recoverIfNeeded");
          setState((s) => ({ ...s, status: "ready", error: null }));
        } catch (err) {
          console.error("[Softphone recover] Re-register failed, full re-init:", err);
          try { device.destroy(); } catch { /* noop */ }
          deviceRef.current = null;
          if (!initializingRef.current) await initialize();
        }
      }
    } finally {
      recoveringRef.current = false;
    }
  }, [initialize, isElectronMainWindow, enabled, refreshDeviceToken, safeRegisterDevice, state.status]);

  useEffect(() => {
    if (isElectronMainWindow || !enabled) return;

    const handleFocus = () => {
      void recoverIfNeeded();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void recoverIfNeeded();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [recoverIfNeeded, isElectronMainWindow, enabled]);

  useEffect(() => {
    if (!isNative || isElectronMainWindow || !enabled) return;

    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        console.log("[Softphone] Native app active — running recovery check");
        void recoverIfNeeded();
      }
    });

    return () => {
      listener.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, [recoverIfNeeded, isNative, isElectronMainWindow, enabled]);

  // Listen for the "phone window shown/focused" IPC from Electron main and
  // run the safe recovery path. This replaces the old "refresh to fix it"
  // flow without ever tearing down a live call.
  useEffect(() => {
    if (isElectronMainWindow || !enabled) return;
    // Only the pop-out should react
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") !== "softphone") return;

    const unsub = onMainMessage("phone-window-shown", () => {
      console.log("[Softphone] Phone window shown — running recovery check");
      recoverIfNeeded();
    });

    return unsub;
  }, [recoverIfNeeded, isElectronMainWindow, enabled]);

  // Make outbound call
  const dial = useCallback(
    async (number: string, contactName?: string, jobId?: string, customerId?: string) => {
      // On Electron main window, forward the dial request to the pop-out via IPC
      if (isElectronMainWindow) {
        sendDialToPopout(number, contactName, jobId, customerId);
        return;
      }

      // Pre-dial health check — never destructive if a call is active.
      // This catches the "gray button after window was hidden" case.
      await recoverIfNeeded();

      if (!deviceRef.current) {
        await initialize();
        await new Promise((r) => setTimeout(r, 1500));
      }

      if (!deviceRef.current) {
        setState((s) => ({ ...s, error: "Device not ready" }));
        return;
      }

      // Resolve jobId/customerId from pending state — but DON'T clear them
      // yet. Clearing happens only after the dial successfully starts, so a
      // failed dial can be retried with the same context.
      const resolvedJobId = jobId || pendingJobId;

      const resolvedName = contactName || pendingContactName || await resolveCallerName(number);
      const normalizedDialNumber = normalizeOutboundDialNumber(number);
      if (!normalizedDialNumber) {
        callDebug("outgoing.connect.request", {
          blocked: true,
          reason: "invalid_destination",
          providedLength: String(number || "").replace(/\D/g, "").length,
        });
        setState((s) => ({ ...s, status: deviceRef.current ? "ready" : "offline", error: "Enter a full 10-digit phone number before calling." }));
        return;
      }

      // Resolve customer_id: explicit > pending > derived from job/estimate
      let resolvedCustomerId: string | null = customerId || pendingCustomerId || null;
      if (!resolvedCustomerId && resolvedJobId) {
        try {
          const { data: jobRow } = await supabase
            .from("jobs").select("customer_id").eq("id", resolvedJobId).maybeSingle();
          resolvedCustomerId = jobRow?.customer_id ?? null;
          if (!resolvedCustomerId) {
            const { data: estRow } = await supabase
              .from("estimates").select("customer_id").eq("id", resolvedJobId).maybeSingle();
            resolvedCustomerId = estRow?.customer_id ?? null;
          }
        } catch { /* noop */ }
      }

      try {
        const dialTransition = dispatchLifecycle({
          type: "OUTBOUND_DIAL",
          call: {
            direction: "outbound",
            customerNumber: normalizedDialNumber,
            agentIdentity: currentEmployeeNameRef.current,
          },
        });
        if (dialTransition.effects.includes("block_outbound_while_active")) {
          setState((s) => ({ ...s, error: "A call is already active" }));
          return;
        }

        // Clear any stale error from a previous failed dial so the UI doesn't
        // show "Device not ready" or similar after the user retries.
        setState((s) => ({
          ...s,
          status: "connecting",
          callerInfo: { number: normalizedDialNumber, name: resolvedName },
          error: null,
        }));
        startSafetyTimer();

        const connectParams: Record<string, string> = {
          To: normalizedDialNumber,
          to: normalizedDialNumber,
          phone: normalizedDialNumber,
        };
        if (resolvedJobId) connectParams.jobId = resolvedJobId;
        if (resolvedCustomerId) connectParams.customerId = resolvedCustomerId;
        if (resolvedName) connectParams.contactName = resolvedName;

        callDebug("outgoing.connect.request", {
          blocked: false,
          toLast4: normalizedDialNumber.slice(-4),
          hasJobId: Boolean(resolvedJobId),
          hasCustomerId: Boolean(resolvedCustomerId),
          hasContactName: Boolean(resolvedName),
        });

        const call = await deviceRef.current.connect({
          params: connectParams,
        });

        // Dial succeeded — NOW it's safe to clear pending context.
        if (pendingContactName) setPendingContactName(null);
        if (pendingJobId) setPendingJobId(null);
        if (pendingCustomerId) setPendingCustomerId(null);

        call.on("accept", () => {
          dispatchLifecycle({
            type: "REMOTE_ANSWERED",
            twilioCallSid: call.parameters?.CallSid || null,
            parentCallSid: call.parameters?.ParentCallSid || null,
            childCallSid: null,
          });
          clearSafetyTimer();
          setState((s) => ({ ...s, status: "on-call", activeCall: call }));
          startTimer();

          // The twilio-voice-twiml webhook is the sole INSERTER of the
          // call_log row (with full enrichment). The browser only UPDATES
          // status when the call connects. Retry once after a short delay
          // to handle the race where the webhook insert hasn't landed yet.
          const possibleSids = [call.parameters?.CallSid, call.parameters?.ParentCallSid].filter(Boolean) as string[];
          if (possibleSids.length === 0) return;

          const tryUpdate = async (attempt: number): Promise<void> => {
            const { data, error } = await supabase
              .from("call_log")
              .update({ status: "in-progress", started_at: new Date().toISOString(), ...(currentEmployeeNameRef.current ? { answered_by: currentEmployeeNameRef.current } : {}) })
              .in("twilio_sid", possibleSids)
              .select("id");
            if (error) {
              console.error("Failed to update outbound call_log to in-progress:", error);
              return;
            }
            if ((!data || data.length === 0) && attempt < 2) {
              // Webhook insert hasn't landed yet — back off and retry once.
              setTimeout(() => { void tryUpdate(attempt + 1); }, 1500);
            }
          };
          void tryUpdate(0);
        });

        wireCallEndHandlers(call);

        dispatchLifecycle({
          type: "OUTBOUND_RINGING",
          twilioCallSid: call.parameters?.CallSid || null,
          parentCallSid: call.parameters?.ParentCallSid || null,
          childCallSid: null,
        });
        setState((s) => ({ ...s, activeCall: call, status: "ringing" }));
      } catch (err: any) {
        callDebug("call.error", {
          phase: "outbound_connect",
          message: err?.message || "Dial failed",
          code: err?.code,
          name: err?.name,
        });
        dispatchLifecycle({ type: "CALL_FAILED", error: err?.message || "Dial failed" });
        clearSafetyTimer();
        // Pending context is preserved so the user can retry. Surface a clean
        // error string in the UI.
        setState((s) => ({ ...s, status: "ready", error: err?.message || "Dial failed" }));
      }
    },
    [initialize, startTimer, resolveCallerName, startSafetyTimer, clearSafetyTimer, wireCallEndHandlers, isElectronMainWindow, pendingContactName, pendingJobId, pendingCustomerId, recoverIfNeeded, dispatchLifecycle]
  );

  // Keep dialRef in sync so IPC listener can call it without stale closure
  useEffect(() => { dialRef.current = dial; }, [dial]);

  // On Electron pop-out: listen for dial-number IPC from the main window
  useEffect(() => {
    if (isElectronMainWindow) return;
    // Only run in the pop-out window
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") !== "softphone") return;

    const applyDialPayload = (payload: any) => {
      const number = typeof payload === "string" ? payload : payload?.number;
      if (number) {
        // Populate the dialer input instead of auto-dialing
        setPendingDialNumber(number);
        setPendingContactName(typeof payload === "string" ? null : payload?.contactName || null);
        setPendingJobId(typeof payload === "string" ? null : payload?.jobId || null);
        setPendingCustomerId(typeof payload === "string" ? null : payload?.customerId || null);
        clearStoredDialRequest();
      }
    };

    const consumeStoredDialRequest = () => {
      const stored = getStoredDialRequest();
      if (stored?.number) {
        setPendingDialNumber(stored.number);
        setPendingContactName(stored.contactName || null);
        setPendingJobId(stored.jobId || null);
        setPendingCustomerId(stored.customerId || null);
        clearStoredDialRequest();
      }
    };

    const unsub = onMainMessage("dial-number", (_event: any, payload: any) => {
      applyDialPayload(payload);
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "softphone:dial-request" && e.newValue) {
        consumeStoredDialRequest();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", consumeStoredDialRequest);
    document.addEventListener("visibilitychange", consumeStoredDialRequest);

    // Catch any dial event sent before this window fully subscribed.
    consumeStoredDialRequest();

    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", consumeStoredDialRequest);
      document.removeEventListener("visibilitychange", consumeStoredDialRequest);
    };
  }, [isElectronMainWindow]);

  // Accept incoming call — just call accept(), let the "accept" event drive state
  const acceptCall = useCallback(() => {
    if (state.incomingCall) {
      const transition = dispatchLifecycle({ type: "LOCAL_ACCEPT" });
      if (transition.effects.includes("ignore_accept_without_incoming")) return;
      setState((s) => ({ ...s, status: "connecting" }));
      sendToMain('call-status-change', 'connecting');
      startSafetyTimer();
      try {
        state.incomingCall.accept();
      } catch (err: any) {
        callDebug("call.error", {
          phase: "incoming_accept",
          message: err?.message || "Could not answer call",
          code: err?.code,
          name: err?.name,
        });
        dispatchLifecycle({ type: "CALL_FAILED", error: err?.message || "Could not answer call" });
        clearSafetyTimer();
        sendToMain('call-status-change', 'ready');
        setState((s) => ({
          ...s,
          incomingCall: null,
          status: deviceRef.current ? "ready" : "offline",
          error: err?.message || "Could not answer call",
        }));
      }
      // State transition (activeCall, status: "on-call") is handled by the
      // call.on("accept") listener wired in the incoming handler above.
    }
  }, [state.incomingCall, startSafetyTimer, clearSafetyTimer, dispatchLifecycle]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    if (state.incomingCall) {
      dispatchLifecycle({ type: "LOCAL_REJECT" });
      markPendingEndedByAgent(state.incomingCall);
      state.incomingCall.reject();
      clearSafetyTimer();
      sendToMain('call-status-change', 'ready');
      // Update call_log to no-answer
      const sid = incomingCallSidRef.current;
      if (sid) {
        supabase
          .from("call_log")
          .update({ status: "no-answer", ended_at: new Date().toISOString() })
          .eq("twilio_sid", sid)
          .then(({ error }) => {
            if (error) console.error("[Softphone] Failed to update rejected call_log:", error);
          });
        incomingCallSidRef.current = null;
      }
      setState((s) => ({ ...s, incomingCall: null, status: "ready" }));
    }
  }, [state.incomingCall, clearSafetyTimer, dispatchLifecycle, markPendingEndedByAgent]);

  // Hang up
  const hangUp = useCallback(() => {
    dispatchLifecycle({ type: "LOCAL_HANGUP" });
    markPendingEndedByAgent(state.activeCall || state.incomingCall);
    if (state.activeCall) {
      state.activeCall.disconnect();
    }
    if (state.incomingCall) {
      state.incomingCall.reject();
    }
    stopTimer();
    clearSafetyTimer();
    sendToMain('call-status-change', 'ready');
    setState((s) => ({
      ...s,
      activeCall: null,
      incomingCall: null,
      callerInfo: null,
      isMuted: false,
      callDuration: 0,
      status: deviceRef.current ? "ready" : "offline",
    }));
  }, [state.activeCall, state.incomingCall, stopTimer, clearSafetyTimer, dispatchLifecycle, markPendingEndedByAgent]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (state.activeCall) {
      const newMuted = !state.isMuted;
      state.activeCall.mute(newMuted);
      setState((s) => ({ ...s, isMuted: newMuted }));
    }
  }, [state.activeCall, state.isMuted]);

  // Hold removed — direct-dial flow does not support participant hold.
  // See ARCHITECTURE: voice flow uses direct <Dial><Number/></Dial>, not <Conference>.

  // Send DTMF tones
  const sendDigit = useCallback(
    (digit: string) => {
      if (state.activeCall) {
        state.activeCall.sendDigits(digit);
      }
    },
    [state.activeCall]
  );

  // Cross-device sync: watch call_log for calls answered on another device
  useEffect(() => {
    const sid = incomingCallSidRef.current;
    if (state.status !== "ringing" || !state.incomingCall || !sid) return;

    const channel = supabase
      .channel(`call-sync-${sid}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "call_log",
        filter: `twilio_sid=eq.${sid}`,
      }, (payload: any) => {
        const newStatus = payload.new?.status;
        if (newStatus === "in-progress" && !localAnsweredRef.current) {
          console.log("[Softphone] Call answered on another device — clearing ringing");
          try { state.incomingCall?.reject(); } catch { /* noop */ }
          incomingCallSidRef.current = null;
          clearSafetyTimer();
          sendToMain('call-status-change', 'ready');
          setState((s) => ({
            ...s,
            incomingCall: null,
            callerInfo: null,
            status: deviceRef.current ? "ready" : "offline",
          }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [state.status, state.incomingCall, clearSafetyTimer]);

  // Hold support indicator removed.

  // Cleanup
  useEffect(() => {
    return () => {
      stopTimer();
      clearSafetyTimer();
      clearTokenRefreshTimer();
      if (deviceRef.current) {
        const device = deviceRef.current;
        deviceRef.current = null;
        try { (device as any).removeAllListeners?.(); } catch { /* noop */ }
        try { device.destroy(); } catch { /* noop */ }
      }
    };
  }, [stopTimer, clearSafetyTimer, clearTokenRefreshTimer]);

  const acceptWaitingCall = useCallback(() => { /* noop */ }, []);

  const dismissWaitingCall = useCallback(() => { /* noop */ }, []);

  // Set a number to preload into the dialer UI.
  // On Electron main window, the popout window is the actual softphone — we
  // forward the dial intent to it via IPC so its dialer input fills in.
  const setDialNumber = useCallback((number: string) => {
    if (isElectronMainWindow) {
      sendDialToPopout(number);
      return;
    }
    setPendingDialNumber(number);
  }, [isElectronMainWindow]);

  // Clear pending dial number (called by UI after consuming it)
  const consumeDialNumber = useCallback(() => {
    const num = pendingDialNumber;
    setPendingDialNumber(null);
    return num;
  }, [pendingDialNumber]);

  return {
    ...state,
    pendingDialNumber,
    initialize,
    recoverIfNeeded,
    dial,
    hangUp,
    toggleMute,
    acceptCall,
    rejectCall,
    sendDigit,
    acceptWaitingCall,
    dismissWaitingCall,
    setDialNumber,
    consumeDialNumber,
    setPendingJobId,
    setPendingCustomerId,
  };
}
