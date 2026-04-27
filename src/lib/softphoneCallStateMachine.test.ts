import { describe, expect, it } from "vitest";
import {
  initialCallLifecycleState,
  reduceCallLifecycle,
  toCallLabel,
  toUiStatus,
} from "./softphoneCallStateMachine";

describe("softphone call state machine", () => {
  it("rings on the first inbound invite", () => {
    const ready = reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state;
    const result = reduceCallLifecycle(ready, {
      type: "INBOUND_INVITE",
      call: {
        localCallId: "local-1",
        twilioCallSid: "CA-child",
        parentCallSid: "CA-parent",
        platform: "electron",
        customerNumber: "+12105551212",
        agentIdentity: "uo2_user_clint",
      },
      at: "2026-04-27T10:00:00.000Z",
    });

    expect(result.state.appState).toBe("incoming_ringing");
    expect(result.state.activeCall?.direction).toBe("inbound");
    expect(result.state.activeCall?.platform).toBe("electron");
    expect(result.state.activeCall?.activeCallSid).toBe("CA-child");
    expect(result.state.activeCall?.startedAt).toBe("2026-04-27T10:00:00.000Z");
    expect(result.effects).toContain("show_incoming_ui");
  });

  it("rejects duplicate inbound calls while a call is already active", () => {
    const first = reduceCallLifecycle(
      reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
      { type: "INBOUND_INVITE", call: { localCallId: "local-1", twilioCallSid: "CA-first" } },
    ).state;

    const duplicate = reduceCallLifecycle(first, {
      type: "INBOUND_INVITE",
      call: { localCallId: "local-2", twilioCallSid: "CA-second" },
    });

    expect(duplicate.state.activeCall?.twilioCallSid).toBe("CA-first");
    expect(duplicate.effects).toContain("reject_duplicate_inbound");
  });

  it("moves inbound accept through connecting into in-call", () => {
    const ringing = reduceCallLifecycle(
      reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
      { type: "INBOUND_INVITE", call: { localCallId: "local-1", twilioCallSid: "CA-child" } },
    ).state;

    const connecting = reduceCallLifecycle(ringing, { type: "LOCAL_ACCEPT" });
    const answered = reduceCallLifecycle(connecting.state, {
      type: "REMOTE_ANSWERED",
      twilioCallSid: "CA-child",
      parentCallSid: "CA-parent",
      at: "2026-04-27T10:01:00.000Z",
    });

    expect(connecting.state.appState).toBe("connecting");
    expect(answered.state.appState).toBe("in_call");
    expect(answered.state.activeCall?.parentCallSid).toBe("CA-parent");
    expect(answered.state.activeCall?.answeredAt).toBe("2026-04-27T10:01:00.000Z");
    expect(answered.effects).toContain("start_timer");
  });

  it("keeps completed calls terminal even when late ringing events arrive", () => {
    const onCall = reduceCallLifecycle(
      reduceCallLifecycle(
        reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
        { type: "OUTBOUND_DIAL", call: { localCallId: "local-1", twilioCallSid: "CA-parent" } },
      ).state,
      { type: "REMOTE_ANSWERED", twilioCallSid: "CA-parent" },
    ).state;

    const ended = reduceCallLifecycle(onCall, {
      type: "REMOTE_ENDED",
      status: "completed",
      at: "2026-04-27T10:05:00.000Z",
    }).state;
    const late = reduceCallLifecycle(ended, { type: "OUTBOUND_RINGING", twilioCallSid: "CA-parent" });

    expect(late.state.appState).toBe("ended");
    expect(late.state.lastEndedCall?.terminalReason).toBe("completed");
    expect(late.state.lastEndedCall?.endedAt).toBe("2026-04-27T10:05:00.000Z");
    expect(late.effects).toContain("ignore_after_terminal");
  });

  it("tracks reconnecting without stopping the call timer path", () => {
    const onCall = reduceCallLifecycle(
      reduceCallLifecycle(
        reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
        { type: "OUTBOUND_DIAL", call: { localCallId: "local-1", twilioCallSid: "CA-parent" } },
      ).state,
      { type: "REMOTE_ANSWERED", twilioCallSid: "CA-parent" },
    ).state;

    const reconnecting = reduceCallLifecycle(onCall, { type: "RECONNECTING" });
    const reconnected = reduceCallLifecycle(reconnecting.state, { type: "RECONNECTED" });

    expect(reconnecting.state.appState).toBe("reconnecting");
    expect(toUiStatus(reconnecting.state.appState)).toBe("on-call");
    expect(reconnected.state.appState).toBe("in_call");
  });

  it("marks agent hangup before disconnecting the active call", () => {
    const onCall = reduceCallLifecycle(
      reduceCallLifecycle(
        reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
        { type: "OUTBOUND_DIAL", call: { localCallId: "local-1", twilioCallSid: "CA-parent" } },
      ).state,
      { type: "REMOTE_ANSWERED", twilioCallSid: "CA-parent" },
    ).state;

    const ending = reduceCallLifecycle(onCall, { type: "LOCAL_HANGUP" });

    expect(ending.state.appState).toBe("ending");
    expect(ending.state.activeCall?.pendingEndedBy).toBe("agent");
    expect(ending.effects).toContain("disconnect_active_call");
  });

  it("preserves agent-ended evidence when the completed webhook arrives after local hangup", () => {
    const onCall = reduceCallLifecycle(
      reduceCallLifecycle(
        reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
        { type: "OUTBOUND_DIAL", call: { localCallId: "local-1", twilioCallSid: "CA-parent" } },
      ).state,
      { type: "REMOTE_ANSWERED", twilioCallSid: "CA-parent" },
    ).state;

    const ending = reduceCallLifecycle(onCall, { type: "LOCAL_HANGUP" }).state;
    const ended = reduceCallLifecycle(ending, {
      type: "REMOTE_ENDED",
      status: "completed",
      at: "2026-04-27T10:06:00.000Z",
    });

    expect(ended.state.appState).toBe("ended");
    expect(ended.state.lastEndedCall?.endedBy).toBe("agent");
    expect(ended.state.lastEndedCall?.terminalReason).toBe("completed");
    expect(ended.effects).toContain("cleanup_call_listeners");
  });

  it("records customer or Twilio ended calls as unknown unless explicit evidence exists", () => {
    const onCall = reduceCallLifecycle(
      reduceCallLifecycle(
        reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
        { type: "INBOUND_INVITE", call: { localCallId: "local-1", twilioCallSid: "CA-child" } },
      ).state,
      { type: "REMOTE_ANSWERED", twilioCallSid: "CA-child" },
    ).state;

    const ended = reduceCallLifecycle(onCall, {
      type: "REMOTE_ENDED",
      status: "completed",
    });

    expect(ended.state.appState).toBe("ended");
    expect(ended.state.lastEndedCall?.endedBy).toBe("unknown");
  });

  it("tracks outbound busy as a terminal ended call, not an active ringing call", () => {
    const ringing = reduceCallLifecycle(
      reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
      { type: "OUTBOUND_DIAL", call: { localCallId: "local-1", twilioCallSid: "CA-parent" } },
    ).state;

    const busy = reduceCallLifecycle(ringing, {
      type: "REMOTE_ENDED",
      status: "busy",
      endedBy: "twilio",
    });

    expect(busy.state.appState).toBe("ended");
    expect(busy.state.activeCall).toBeNull();
    expect(busy.state.lastEndedCall?.terminalReason).toBe("busy");
    expect(busy.state.lastEndedCall?.endedBy).toBe("twilio");
  });

  it("keeps reconnecting terminal if the call closes before it reconnects", () => {
    const onCall = reduceCallLifecycle(
      reduceCallLifecycle(
        reduceCallLifecycle(initialCallLifecycleState, { type: "DEVICE_READY" }).state,
        { type: "OUTBOUND_DIAL", call: { localCallId: "local-1", twilioCallSid: "CA-parent" } },
      ).state,
      { type: "REMOTE_ANSWERED", twilioCallSid: "CA-parent" },
    ).state;

    const reconnecting = reduceCallLifecycle(onCall, { type: "RECONNECTING" }).state;
    const ended = reduceCallLifecycle(reconnecting, { type: "REMOTE_ENDED", status: "completed" }).state;
    const staleReconnected = reduceCallLifecycle(ended, { type: "RECONNECTED" });

    expect(ended.appState).toBe("ended");
    expect(staleReconnected.state.appState).toBe("ended");
    expect(staleReconnected.effects).toContain("ignore_after_terminal");
  });

  it("exposes user-facing labels from the same state value", () => {
    expect(toCallLabel("incoming_ringing")).toBe("Incoming call");
    expect(toCallLabel("outgoing_dialing")).toBe("Calling...");
    expect(toCallLabel("reconnecting")).toBe("Reconnecting...");
    expect(toCallLabel("failed")).toBe("Call failed");
  });
});
