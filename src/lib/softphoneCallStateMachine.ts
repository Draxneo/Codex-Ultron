export type AppCallState =
  | "idle"
  | "device_registering"
  | "ready"
  | "incoming_ringing"
  | "outgoing_dialing"
  | "outgoing_ringing"
  | "connecting"
  | "in_call"
  | "reconnecting"
  | "ending"
  | "ended"
  | "failed"
  | "offline";

export type CallDirection = "inbound" | "outbound" | null;

export type SoftphoneUiStatus =
  | "offline"
  | "registering"
  | "ready"
  | "connecting"
  | "ringing"
  | "on-call"
  | "error";

export interface ActiveCallRecord {
  localCallId: string;
  twilioCallSid: string | null;
  parentCallSid: string | null;
  childCallSid: string | null;
  activeCallSid: string | null;
  direction: CallDirection;
  customerNumber: string | null;
  agentIdentity: string | null;
  pendingEndedBy: "agent" | null;
}

export interface CallLifecycleState {
  appState: AppCallState;
  activeCall: ActiveCallRecord | null;
  lastEndedCall: ActiveCallRecord | null;
  error: string | null;
}

export type CallLifecycleEvent =
  | { type: "DEVICE_REGISTERING" }
  | { type: "DEVICE_READY" }
  | { type: "DEVICE_OFFLINE" }
  | { type: "DEVICE_ERROR"; error?: string | null }
  | { type: "INBOUND_INVITE"; call: Partial<ActiveCallRecord> }
  | { type: "OUTBOUND_DIAL"; call: Partial<ActiveCallRecord> }
  | { type: "OUTBOUND_RINGING"; twilioCallSid?: string | null; parentCallSid?: string | null; childCallSid?: string | null }
  | { type: "LOCAL_ACCEPT" }
  | { type: "REMOTE_ANSWERED"; twilioCallSid?: string | null; parentCallSid?: string | null; childCallSid?: string | null }
  | { type: "LOCAL_HANGUP" }
  | { type: "LOCAL_REJECT" }
  | { type: "REMOTE_ENDED"; status?: string | null }
  | { type: "RECONNECTING" }
  | { type: "RECONNECTED" }
  | { type: "CALL_FAILED"; error?: string | null }
  | { type: "RESET_TO_READY" };

export interface CallLifecycleTransition {
  state: CallLifecycleState;
  effects: string[];
}

const terminalStates = new Set<AppCallState>(["ended", "failed"]);
const activeStates = new Set<AppCallState>([
  "incoming_ringing",
  "outgoing_dialing",
  "outgoing_ringing",
  "connecting",
  "in_call",
  "reconnecting",
  "ending",
]);

export const initialCallLifecycleState: CallLifecycleState = {
  appState: "offline",
  activeCall: null,
  lastEndedCall: null,
  error: null,
};

export function createLocalCallId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function isCallActive(appState: AppCallState): boolean {
  return activeStates.has(appState);
}

export function toUiStatus(appState: AppCallState): SoftphoneUiStatus {
  switch (appState) {
    case "device_registering":
      return "registering";
    case "ready":
    case "ended":
    case "idle":
      return "ready";
    case "incoming_ringing":
    case "outgoing_ringing":
      return "ringing";
    case "outgoing_dialing":
    case "connecting":
    case "ending":
      return "connecting";
    case "in_call":
    case "reconnecting":
      return "on-call";
    case "failed":
      return "error";
    case "offline":
      return "offline";
    default:
      return "offline";
  }
}

export function buildActiveCallRecord(call: Partial<ActiveCallRecord>): ActiveCallRecord {
  const activeCallSid = call.activeCallSid || call.twilioCallSid || call.childCallSid || call.parentCallSid || null;
  return {
    localCallId: call.localCallId || createLocalCallId(),
    twilioCallSid: call.twilioCallSid || activeCallSid,
    parentCallSid: call.parentCallSid || null,
    childCallSid: call.childCallSid || null,
    activeCallSid,
    direction: call.direction || null,
    customerNumber: call.customerNumber || null,
    agentIdentity: call.agentIdentity || null,
    pendingEndedBy: call.pendingEndedBy || null,
  };
}

function mergeCallIds(
  existing: ActiveCallRecord | null,
  event: { twilioCallSid?: string | null; parentCallSid?: string | null; childCallSid?: string | null },
): ActiveCallRecord | null {
  if (!existing) return null;
  const twilioCallSid = event.twilioCallSid || existing.twilioCallSid;
  const parentCallSid = event.parentCallSid || existing.parentCallSid;
  const childCallSid = event.childCallSid || existing.childCallSid;
  return {
    ...existing,
    twilioCallSid,
    parentCallSid,
    childCallSid,
    activeCallSid: existing.activeCallSid || twilioCallSid || childCallSid || parentCallSid,
  };
}

export function reduceCallLifecycle(
  current: CallLifecycleState,
  event: CallLifecycleEvent,
): CallLifecycleTransition {
  if (
    terminalStates.has(current.appState) &&
    !["RESET_TO_READY", "DEVICE_READY", "DEVICE_OFFLINE", "DEVICE_REGISTERING", "DEVICE_ERROR"].includes(event.type)
  ) {
    return { state: current, effects: ["ignore_after_terminal"] };
  }

  switch (event.type) {
    case "DEVICE_REGISTERING":
      return {
        state: { ...current, appState: "device_registering", error: null },
        effects: [],
      };
    case "DEVICE_READY":
      return {
        state: { ...current, appState: current.activeCall ? current.appState : "ready", error: null },
        effects: [],
      };
    case "DEVICE_OFFLINE":
      return {
        state: { ...current, appState: "offline", activeCall: null },
        effects: ["stop_timer", "cleanup_call_listeners"],
      };
    case "DEVICE_ERROR":
      return {
        state: { ...current, appState: "failed", error: event.error || "Device error" },
        effects: ["stop_timer"],
      };
    case "INBOUND_INVITE":
      if (isCallActive(current.appState) || current.activeCall) {
        return { state: current, effects: ["reject_duplicate_inbound"] };
      }
      return {
        state: {
          ...current,
          appState: "incoming_ringing",
          activeCall: buildActiveCallRecord({ ...event.call, direction: "inbound" }),
          error: null,
        },
        effects: ["show_incoming_ui"],
      };
    case "OUTBOUND_DIAL":
      if (isCallActive(current.appState) || current.activeCall) {
        return { state: current, effects: ["block_outbound_while_active"] };
      }
      return {
        state: {
          ...current,
          appState: "outgoing_dialing",
          activeCall: buildActiveCallRecord({ ...event.call, direction: "outbound" }),
          error: null,
        },
        effects: ["start_safety_timer"],
      };
    case "OUTBOUND_RINGING":
      return {
        state: {
          ...current,
          appState: "outgoing_ringing",
          activeCall: mergeCallIds(current.activeCall, event),
        },
        effects: [],
      };
    case "LOCAL_ACCEPT":
      if (current.appState !== "incoming_ringing") {
        return { state: current, effects: ["ignore_accept_without_incoming"] };
      }
      return {
        state: { ...current, appState: "connecting" },
        effects: ["disable_answer_button", "stop_safety_timer"],
      };
    case "REMOTE_ANSWERED":
      return {
        state: {
          ...current,
          appState: "in_call",
          activeCall: mergeCallIds(current.activeCall, event),
          error: null,
        },
        effects: ["start_timer", "mark_answered"],
      };
    case "LOCAL_HANGUP":
      if (!current.activeCall) return { state: current, effects: ["ignore_hangup_without_call"] };
      return {
        state: {
          ...current,
          appState: "ending",
          activeCall: { ...current.activeCall, pendingEndedBy: "agent" },
        },
        effects: ["disable_hangup_button", "disconnect_active_call"],
      };
    case "LOCAL_REJECT":
      if (!current.activeCall) return { state: current, effects: ["ignore_reject_without_call"] };
      return {
        state: {
          ...current,
          appState: "ended",
          activeCall: null,
          lastEndedCall: { ...current.activeCall, pendingEndedBy: "agent" },
        },
        effects: ["reject_incoming_call", "stop_timer", "cleanup_call_listeners"],
      };
    case "RECONNECTING":
      if (current.appState !== "in_call") return { state: current, effects: ["ignore_reconnecting_not_in_call"] };
      return {
        state: { ...current, appState: "reconnecting" },
        effects: ["show_reconnecting_banner"],
      };
    case "RECONNECTED":
      if (current.appState !== "reconnecting") return { state: current, effects: ["ignore_reconnected_not_reconnecting"] };
      return {
        state: { ...current, appState: "in_call" },
        effects: ["hide_reconnecting_banner"],
      };
    case "REMOTE_ENDED":
      return {
        state: {
          ...current,
          appState: "ended",
          lastEndedCall: current.activeCall,
          activeCall: null,
          error: null,
        },
        effects: ["stop_timer", "cleanup_call_listeners"],
      };
    case "CALL_FAILED":
      return {
        state: {
          ...current,
          appState: "failed",
          lastEndedCall: current.activeCall,
          activeCall: null,
          error: event.error || "Call failed",
        },
        effects: ["stop_timer", "cleanup_call_listeners"],
      };
    case "RESET_TO_READY":
      return {
        state: { ...current, appState: "ready", activeCall: null, error: null },
        effects: ["stop_timer", "cleanup_call_listeners"],
      };
    default:
      return { state: current, effects: [] };
  }
}
