/**
 * useNativeSoftphone.ts — Native Twilio Voice SDK bridge via @capgo/capacitor-twilio-voice.
 *
 * Handles all call lifecycle on Android/iOS using the NATIVE Twilio Voice SDK,
 * which manages AudioSwitch (earpiece/speaker/bluetooth) at the OS level.
 *
 * Desktop/web continues using the JS SDK in useSoftphone.ts.
 *
 * CRITICAL: Capacitor addListener() is async and MUST be awaited before calling
 * login(). Otherwise the native plugin can fire registrationSuccess before the
 * JS listener is attached and the event is lost forever.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeLast10 } from "@/lib/formatters";
import { toE164 } from "@/lib/formatters";
import {
  addContactLookup,
  buildCustomerDisplayName,
  type ContactLookupMap,
} from "@/lib/communications";
import { useCapacitor } from "@/hooks/useCapacitor";
import type { SoftphoneStatus, SoftphoneState } from "./useSoftphone";

let nativePlugin: any = null;
let pluginLoadPromise: Promise<void> | null = null;

/**
 * Load the native plugin module once. Sets nativePlugin as a side-effect.
 * CRITICAL: We must NEVER return the plugin object from an async function.
 * Capacitor registerPlugin() returns a Proxy that traps .then(). When JS
 * resolves an async function's return value it checks if the value is
 * "thenable" — the Proxy intercepts that .then() call and throws
 * "CapacitorTwilioVoice.then() is not implemented on android".
 * By returning void and using a sync getter we avoid this entirely.
 */
async function loadPlugin(): Promise<void> {
  if (nativePlugin) return;
  if (pluginLoadPromise) { await pluginLoadPromise; return; }
  pluginLoadPromise = (async () => {
    try {
      const mod = await import("@capgo/capacitor-twilio-voice");
      nativePlugin = mod.CapacitorTwilioVoice ?? mod.default;
    } catch {
      nativePlugin = null;
    }
  })();
  await pluginLoadPromise;
}

/** Synchronous getter — returns the cached plugin or null. Call loadPlugin() first. */
function getPlugin(): any {
  return nativePlugin ?? null;
}

export function useNativeSoftphone(enabled: boolean = true) {
  const { platform } = useCapacitor();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const registrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrationRetryTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const listenerHandlesRef = useRef<Array<{ remove: () => Promise<void> | void }>>([]);
  const listenersRegisteredRef = useRef(false);
  const contactMapRef = useRef<ContactLookupMap>({});
  const initializingRef = useRef(false);
  const registeredRef = useRef(false);
  const activeCallSidRef = useRef<string | null>(null);
  const incomingCallSidRef = useRef<string | null>(null);
  // Current user's employee name — written to call_log.answered_by on accept so
  // server-side isUserBusy() can correctly skip this user when routing the next
  // inbound call. See useSoftphone.ts for full rationale.
  const currentEmployeeNameRef = useRef<string | null>(null);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isBluetooth, setIsBluetooth] = useState(false);
  const [audioDeviceLabel, setAudioDeviceLabel] = useState<string>("Earpiece");
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

  // Build employee-only contact map AND resolve current user's employee name
  // for answered_by attribution (see useSoftphone.ts for the same logic).
  useEffect(() => {
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
      console.log("[NativeSoftphone] answered_by attribution resolved as:", resolvedEmployeeName);
      contactMapRef.current = map;
    };
    buildEmployeeMap();
  }, []);

  // On-demand caller ID: check employee map first, then DB lookup for customers
  const resolveCallerName = useCallback(async (phone: string): Promise<string | undefined> => {
    const key = normalizeLast10(phone);
    if (!key) return undefined;

    const emp = contactMapRef.current[key];
    if (emp) return emp.name;

    const { data: match } = await supabase
      .rpc("find_customer_by_phone", { digits: key })
      .limit(1)
      .maybeSingle();
    if (match) {
      const name = buildCustomerDisplayName(match);
      if (name) {
        contactMapRef.current[key] = { name, type: "customer" };
        return name;
      }
    }
    return undefined;
  }, []);

  const fetchToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const tokenPlatform = platform === "android" || platform === "ios" ? platform : "web";
    console.log("[NativeSoftphone] fetchToken platform:", tokenPlatform);

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ platform: tokenPlatform }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Failed to fetch token");
    }
    const { token } = await resp.json();
    return token;
  }, [platform]);

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

  const clearRegistrationTimeout = useCallback(() => {
    if (registrationTimeoutRef.current) {
      clearTimeout(registrationTimeoutRef.current);
      registrationTimeoutRef.current = null;
    }
  }, []);

  const clearRegistrationRetries = useCallback(() => {
    for (const timeout of registrationRetryTimeoutsRef.current) {
      clearTimeout(timeout);
    }
    registrationRetryTimeoutsRef.current = [];
  }, []);

  const clearTokenRefreshTimer = useCallback(() => {
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback(() => {
    clearTokenRefreshTimer();
    tokenRefreshTimerRef.current = setTimeout(() => {
      void refreshRegistration("50-minute timer");
    }, 50 * 60 * 1000);
  }, [clearTokenRefreshTimer]);

  const refreshRegistration = useCallback(async (reason: string) => {
    await loadPlugin();
    const plugin = getPlugin();
    if (!plugin) return false;

    try {
      console.log(`[NativeSoftphone] Refreshing registration (${reason})`);
      const newToken = await fetchToken();
      if (!newToken) throw new Error("Unable to refresh voice token");
      registeredRef.current = false;
      setState((s) => ({ ...s, status: "registering", error: null }));
      await plugin.login({ accessToken: newToken });
      scheduleTokenRefresh();
      return true;
    } catch (err: any) {
      console.error(`[NativeSoftphone] Registration refresh failed (${reason}):`, err?.message || err);
      return false;
    }
  }, [fetchToken, scheduleTokenRefresh]);

  const attachPluginListeners = useCallback(async (plugin: any) => {
    if (listenersRegisteredRef.current) return;

    const registrationSuccessHandle = await plugin.addListener("registrationSuccess", () => {
      clearRegistrationTimeout();
      clearRegistrationRetries();
      registeredRef.current = true;
      initializingRef.current = false;
      scheduleTokenRefresh();
      setState((s) => ({ ...s, status: "ready", error: null }));
      console.log("[NativeSoftphone] registrationSuccess fired");
    });

    const registrationFailureHandle = await plugin.addListener("registrationFailure", (data: any) => {
      clearRegistrationTimeout();
      clearRegistrationRetries();
      clearTokenRefreshTimer();
      registeredRef.current = false;
      initializingRef.current = false;
      const errMsg = data?.error || data?.message || JSON.stringify(data) || "Registration failed";
      console.error("[NativeSoftphone] registrationFailure:", errMsg, data);
      setState((s) => ({ ...s, status: "error", error: errMsg }));
    });

    const callInviteReceivedHandle = await plugin.addListener("callInviteReceived", async (data: any) => {
      const from = data?.from || "Unknown";
      const callSid = data?.callSid || "";

      // ── Auto-reject 2nd calls while on a live call ──
      // The native Twilio plugin's notification/ringer can leak into the
      // active-call audio route. Reject as busy immediately so the caller
      // gets routed to voicemail/overflow per the server's <Dial action="...">
      // and no second ring ever plays in our user's ear.
      const currentStatus = (state as any).status as SoftphoneStatus;
      if (currentStatus === "on-call" || currentStatus === "connecting") {
        console.log("[NativeSoftphone] Auto-rejecting 2nd inbound call (already on-call)", callSid);
        try {
          if (callSid) await plugin.rejectCall({ callSid });
        } catch (e) {
          console.warn("[NativeSoftphone] Auto-reject failed:", e);
        }
        return;
      }

      const resolvedName = await resolveCallerName(from);
      setState((s) => {
        // Defensive guard: state may have flipped to on-call during the await
        if (s.status === "on-call" || s.status === "connecting") {
          try { plugin.rejectCall({ callSid }); } catch {}
          return s;
        }
        incomingCallSidRef.current = callSid;
        return { ...s, incomingCall: data, callerInfo: { number: from, name: resolvedName }, status: "ringing" as SoftphoneStatus };
      });

      // Insert a call_log row immediately so other devices can see it's ringing
      if (callSid) {
        supabase
          .from("call_log")
          .upsert({
            twilio_sid: callSid,
            phone_number: from,
            direction: "inbound",
            status: "ringing",
            contact_name: resolvedName || null,
            contact_type: "unknown",
            created_at: new Date().toISOString(),
          }, { onConflict: "twilio_sid" })
          .then(({ error }) => {
            if (error) console.error("[NativeSoftphone] Failed to insert ringing call_log:", error);
          });
      }
    });

    const callConnectedHandle = await plugin.addListener("callConnected", (data: any) => {
      activeCallSidRef.current = data?.callSid || "";
      setState((s) => ({ ...s, status: "on-call", activeCall: data, incomingCall: null }));
      startTimer();

      // Query audio device to detect Bluetooth — let the SDK's AudioSwitch
      // manage priority (BT > Wired > Earpiece > Speaker) without forcing
      try {
        plugin.getSelectedAudioDevice?.().then?.((info: any) => {
          const deviceName = info?.device || info?.name || "";
          const bt = /bluetooth/i.test(deviceName);
          const spk = /speaker/i.test(deviceName);
          setIsBluetooth(bt);
          setIsSpeaker(spk);
          setAudioDeviceLabel(bt ? deviceName.replace(/bluetooth_?/i, "").trim() || "Bluetooth" : spk ? "Speaker" : "Earpiece");
          console.log("[NativeSoftphone] audio device on connect:", deviceName);
        });
      } catch {}

      const possibleSids = [data?.callSid, data?.parentCallSid].filter(Boolean);
      if (possibleSids.length > 0) {
        supabase
          .from("call_log")
          .update({ status: "in-progress", started_at: new Date().toISOString(), ...(currentEmployeeNameRef.current ? { answered_by: currentEmployeeNameRef.current } : {}) })
          .in("twilio_sid", possibleSids)
          .then(({ error }) => {
            if (error) console.error("[NativeSoftphone] Failed to update call_log to in-progress:", error);
          });
      }
    });

    const callDisconnectedHandle = await plugin.addListener("callDisconnected", (data: any) => {
      activeCallSidRef.current = null;
      incomingCallSidRef.current = null;
      stopTimer();
      setIsSpeaker(false);
      setIsBluetooth(false);
      setAudioDeviceLabel("Earpiece");
      const errMsg = data?.error || null;
      setState((s) => ({
        ...s,
        activeCall: null,
        incomingCall: null,
        callerInfo: null,
        waitingCall: null,
        waitingCallerInfo: null,
        isMuted: false,
        callDuration: 0,
        status: registeredRef.current ? "ready" : "offline",
        error: errMsg,
      }));
    });

    const outgoingCallFailedHandle = await plugin.addListener("outgoingCallFailed", (data: any) => {
      console.error("[NativeSoftphone] outgoingCallFailed:", data);
      activeCallSidRef.current = null;
      incomingCallSidRef.current = null;
      stopTimer();
      setIsSpeaker(false);
      const reason = data?.reason || data?.error || "Outgoing call failed";
      setState((s) => ({
        ...s,
        activeCall: null,
        incomingCall: null,
        callerInfo: null,
        waitingCall: null,
        waitingCallerInfo: null,
        isMuted: false,
        callDuration: 0,
        status: registeredRef.current ? "ready" : "offline",
        error: reason,
      }));
    });

    const callRingingHandle = await plugin.addListener("callRinging", () => {
      // Only set ringing if we're NOT already on-call or connected — the native
      // SDK can re-fire this event during call setup, which would restart the ringtone.
      setState((s) => {
        if (s.status === "on-call" || s.status === "connecting" || s.status === "ringing") return s;
        return { ...s, status: "ringing" };
      });
    });

    const callInviteCancelledHandle = await plugin.addListener("callInviteCancelled", () => {
      // Update call_log to 'cancelled' so other devices know
      const cancelledSid = incomingCallSidRef.current;
      if (cancelledSid) {
        supabase
          .from("call_log")
          .update({ status: "cancelled", ended_at: new Date().toISOString() })
          .eq("twilio_sid", cancelledSid)
          .then(({ error }) => {
            if (error) console.error("[NativeSoftphone] Failed to update cancelled call_log:", error);
          });
      }
      incomingCallSidRef.current = null;
      setState((s) => {
        if (s.status === "ringing") {
          return { ...s, incomingCall: null, callerInfo: null, status: "ready" as SoftphoneStatus };
        }
        return { ...s, waitingCall: null, waitingCallerInfo: null };
      });
    });

    // Token refresh: native SDK fires this ~60s before the JWT expires.
    // Without handling it, the SDK drops registration and shows "permission expired".
    const tokenExpiredHandle = await plugin.addListener("tokenWillExpire", async () => {
      console.log("[NativeSoftphone] tokenWillExpire — refreshing token");
      await refreshRegistration("tokenWillExpire");
    });

    // Also handle hard expiry in case tokenWillExpire didn't fire
    const tokenExpiredHardHandle = await plugin.addListener("tokenExpired", async () => {
      console.warn("[NativeSoftphone] tokenExpired — re-registering");
      registeredRef.current = false;
      clearTokenRefreshTimer();
      const refreshed = await refreshRegistration("tokenExpired");
      if (!refreshed) {
        console.error("[NativeSoftphone] re-registration after expiry failed");
        setState((s) => ({ ...s, status: "error", error: "Token expired — please sign in again" }));
      }
    });

    const offlineHandle = await plugin.addListener("offline", async (data: any) => {
      console.warn("[NativeSoftphone] offline event — refreshing registration", data);
      registeredRef.current = false;
      setState((s) => ({ ...s, status: s.status === "on-call" ? s.status : "offline" }));
      await refreshRegistration("offline event");
    });

    const deviceErrorHandle = await plugin.addListener("error", async (data: any) => {
      const errMsg = data?.error || data?.message || "Native softphone error";
      console.error("[NativeSoftphone] error event:", errMsg, data);
      if (/token|websocket|transport|offline|network/i.test(errMsg)) {
        await refreshRegistration(`error:${errMsg}`);
        return;
      }
      setState((s) => ({ ...s, error: errMsg }));
    });

    listenerHandlesRef.current = [
      registrationSuccessHandle,
      registrationFailureHandle,
      callInviteReceivedHandle,
      callConnectedHandle,
      callDisconnectedHandle,
      outgoingCallFailedHandle,
      callRingingHandle,
      callInviteCancelledHandle,
      tokenExpiredHandle,
      tokenExpiredHardHandle,
      offlineHandle,
      deviceErrorHandle,
    ];
    listenersRegisteredRef.current = true;
  }, [clearRegistrationRetries, clearRegistrationTimeout, clearTokenRefreshTimer, refreshRegistration, resolveCallerName, scheduleTokenRefresh, startTimer, stopTimer]);

  const initialize = useCallback(async () => {
    if (initializingRef.current || registeredRef.current) return;
    initializingRef.current = true;

    try {
      setState((s) => ({ ...s, status: "registering", error: null }));
      console.log("[NativeSoftphone] initialize() starting...");

      await loadPlugin();
      const plugin = getPlugin();
      if (!plugin) {
        console.error("[NativeSoftphone] plugin is null after loadPlugin()");
        setState((s) => ({ ...s, status: "error", error: "Native voice plugin not available" }));
        initializingRef.current = false;
        return;
      }
      console.log("[NativeSoftphone] plugin loaded, fetching token...");

      const token = await fetchToken();
      if (!token) {
        console.error("[NativeSoftphone] token is null/empty");
        setState((s) => ({ ...s, status: "offline", error: "Not authenticated" }));
        initializingRef.current = false;
        return;
      }
      console.log("[NativeSoftphone] token received, length:", token.length);

      // CRITICAL: await every addListener before calling login().
      // The Android plugin's login() resolves immediately and performRegistration()
      // silently no-ops until Firebase finishes producing an FCM token.
      // We must have listeners attached first, then keep nudging registration
      // until the native plugin emits registrationSuccess or registrationFailure.
      await attachPluginListeners(plugin);

      // All listeners are now awaited and fully registered.
      // Start timeout before login so we catch all failure paths.
      clearRegistrationTimeout();
      clearRegistrationRetries();
      registrationTimeoutRef.current = setTimeout(() => {
        if (!registeredRef.current) {
          console.error("[NativeSoftphone] 15s timeout — registration never completed");
          clearRegistrationRetries();
          registeredRef.current = false;
          setState((s) => ({
            ...s,
            status: "error",
            error: "Registration timed out — FCM token may not be available",
          }));
          initializingRef.current = false;
        }
      }, 60000);

      const attemptLogin = async (reason: string) => {
        console.log(`[NativeSoftphone] ${reason}: calling login()`);
        await plugin.login({ accessToken: token });
      };

      await attemptLogin("initial registration attempt");

      for (const delay of [5000, 15000, 30000]) {
        const retryTimeout = setTimeout(() => {
          if (registeredRef.current) return;
          attemptLogin(`retry at ${delay}ms`).catch((err: any) => {
            console.warn(`[NativeSoftphone] login retry at ${delay}ms failed:`, err?.message || err);
          });
        }, delay);
        registrationRetryTimeoutsRef.current.push(retryTimeout);
      }

      console.log("[NativeSoftphone] login() returned — waiting for registrationSuccess");

    } catch (err: any) {
      clearRegistrationTimeout();
      clearRegistrationRetries();
      console.error("[NativeSoftphone] Init error:", err);
      setState((s) => ({ ...s, status: "error", error: err.message }));
      initializingRef.current = false;
    }
  }, [attachPluginListeners, clearRegistrationRetries, clearRegistrationTimeout, fetchToken]);

  useEffect(() => {
    if (!enabled) return;
    const checkAndConnect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !registeredRef.current && !initializingRef.current) {
        setTimeout(() => initialize(), 2000);
      }
    };
    checkAndConnect();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && !registeredRef.current && !initializingRef.current) {
        setTimeout(() => initialize(), 2000);
      } else if (event === "SIGNED_OUT") {
        clearRegistrationTimeout();
        clearRegistrationRetries();
        try { getPlugin()?.logout?.(); } catch {}
        initializingRef.current = false;
        registeredRef.current = false;
        activeCallSidRef.current = null;
        incomingCallSidRef.current = null;
        setState({ status: "offline", activeCall: null, isMuted: false, callDuration: 0, callerInfo: null, incomingCall: null, waitingCall: null, waitingCallerInfo: null, error: null });
      }
    });
    return () => subscription.unsubscribe();
  }, [initialize, enabled, clearRegistrationRetries, clearRegistrationTimeout]);

  useEffect(() => {
    if (!enabled) return;

    heartbeatTimerRef.current = setInterval(() => {
      if (initializingRef.current || state.status === "on-call" || state.status === "ringing" || state.status === "connecting") {
        return;
      }

      const plugin = getPlugin();
      const checkRegistration = async () => {
        const loggedIn = plugin?.isLoggedIn ? await plugin.isLoggedIn().catch(() => false) : registeredRef.current;
        if (!registeredRef.current || !loggedIn) {
          console.warn("[NativeSoftphone heartbeat] Plugin not registered/logged in — refreshing");
          await refreshRegistration("heartbeat");
        }
      };

      void checkRegistration();
    }, 30_000);

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [enabled, refreshRegistration, state.status]);

  useEffect(() => {
    if (!enabled) return;

    const ensureRegistered = () => {
      const plugin = getPlugin();
      const recoverRegistration = async () => {
        const loggedIn = plugin?.isLoggedIn ? await plugin.isLoggedIn().catch(() => false) : registeredRef.current;
        if (!registeredRef.current || !loggedIn) {
          if (!initializingRef.current) {
            await initialize();
          }
          return;
        }

        if (state.status === "offline") {
          setState((s) => ({ ...s, status: "ready", error: null }));
        }
      };

      void recoverRegistration();
    };

    const handleFocus = () => {
      ensureRegistered();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        ensureRegistered();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [initialize, enabled, state.status]);

  const dial = useCallback(async (number: string, contactName?: string, jobId?: string, customerId?: string) => {
    const plugin = getPlugin();
    if (!plugin) return;
    if (!registeredRef.current) {
      await initialize();
      await new Promise((r) => setTimeout(r, 1500));
    }
    const normalizedNumber = toE164(number) ?? number;
    const resolvedName = contactName || await resolveCallerName(normalizedNumber);
    const resolvedJobId = jobId || pendingJobId;
    if (pendingJobId) setPendingJobId(null);
    let resolvedCustomerIdInitial = customerId || pendingCustomerId;
    if (pendingCustomerId) setPendingCustomerId(null);

    let resolvedCustomerId: string | null = resolvedCustomerIdInitial ?? null;
    if (!resolvedCustomerId && resolvedJobId) {
      try {
        const { data: jobRow } = await supabase
          .from("jobs")
          .select("customer_id")
          .eq("id", resolvedJobId)
          .maybeSingle();
        resolvedCustomerId = jobRow?.customer_id ?? null;
        if (!resolvedCustomerId) {
          // Maybe it's an estimate id
          const { data: estRow } = await supabase
            .from("estimates")
            .select("customer_id")
            .eq("id", resolvedJobId)
            .maybeSingle();
          resolvedCustomerId = estRow?.customer_id ?? null;
        }
      } catch (e) {
        console.warn("[NativeSoftphone] failed to resolve customer_id for job", resolvedJobId, e);
      }
    }

    console.log("[NativeSoftphone] dial()", {
      originalNumber: number,
      normalizedNumber,
      registered: registeredRef.current,
      jobId: resolvedJobId,
      customerId: resolvedCustomerId,
    });
    setState((s) => ({ ...s, status: "connecting", callerInfo: { number: normalizedNumber, name: resolvedName } }));
    try {
      const callResult = await plugin.makeCall({ to: normalizedNumber });
      const returnedSid: string | null = (callResult as any)?.callSid ?? null;

      // ── Deterministic linking ──
      // Native SDK doesn't support custom TwiML params, so the call_log row is created
      // by twilio-voice-twiml without job/customer context. We patch it here using the
      // callSid returned by the native plugin (fast, race-free) and fall back to a
      // recent-row scan only if the SID isn't available yet.
      if (resolvedJobId || resolvedCustomerId || resolvedName) {
        const patch: Record<string, any> = {};
        if (resolvedJobId) patch.related_job_id = resolvedJobId;
        if (resolvedCustomerId) patch.related_customer_id = resolvedCustomerId;
        if (resolvedName) {
          patch.contact_name = resolvedName;
          patch.contact_type = resolvedCustomerId ? "customer" : "employee";
        }

        const applyPatch = async () => {
          // Preferred: patch by twilio_sid (created by twilio-voice-twiml)
          if (returnedSid) {
            const { data: existing } = await supabase
              .from("call_log")
              .select("id")
              .eq("twilio_sid", returnedSid)
              .maybeSingle();
            if (existing?.id) {
              await supabase.from("call_log").update(patch).eq("id", existing.id);
              return true;
            }
          }
          // Fallback: most recent unlinked outbound to this number within 60s
          const norm = normalizedNumber.replace(/\D/g, "").slice(-10);
          const cutoff = new Date(Date.now() - 60_000).toISOString();
          const { data: rows } = await supabase
            .from("call_log")
            .select("id, phone_number")
            .eq("direction", "outbound")
            .gte("created_at", cutoff)
            .order("created_at", { ascending: false })
            .limit(10);
          const match = (rows || []).find(
            (r) => r.phone_number?.replace(/\D/g, "").slice(-10) === norm,
          );
          if (match?.id) {
            await supabase.from("call_log").update(patch).eq("id", match.id);
            return true;
          }
          return false;
        };

        // Try immediately, then retry once after 1.5s if the row didn't exist yet
        const ok = await applyPatch();
        if (!ok) setTimeout(() => { applyPatch().catch(() => {}); }, 1500);
      }
    } catch (err: any) {
      setState((s) => ({ ...s, status: "ready", error: err.message }));
    }
  }, [initialize, resolveCallerName, pendingJobId, pendingCustomerId]);

  const acceptCall = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin || !incomingCallSidRef.current) return;
    // Immediately move to "connecting" so the ringtone stops before the SDK fires callConnected
    setState((s) => ({ ...s, status: "connecting" as SoftphoneStatus, incomingCall: null }));
    try { await plugin.acceptCall({ callSid: incomingCallSidRef.current }); } catch {}
  }, []);

  const rejectCall = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin || !incomingCallSidRef.current) return;
    const rejectedSid = incomingCallSidRef.current;
    try {
      await plugin.rejectCall({ callSid: rejectedSid });
      // Update call_log to no-answer
      supabase
        .from("call_log")
        .update({ status: "no-answer", ended_at: new Date().toISOString() })
        .eq("twilio_sid", rejectedSid)
        .then(({ error }) => {
          if (error) console.error("[NativeSoftphone] Failed to update rejected call_log:", error);
        });
      incomingCallSidRef.current = null;
      setState((s) => ({ ...s, incomingCall: null, status: "ready" }));
    } catch {}
  }, []);

  const hangUp = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin) return;
    try { await plugin.endCall({ callSid: activeCallSidRef.current || undefined }); } catch {}
    activeCallSidRef.current = null;
    stopTimer();
    setIsSpeaker(false);
    setState((s) => ({
      ...s, activeCall: null, incomingCall: null, callerInfo: null,
      isMuted: false, callDuration: 0,
      status: registeredRef.current ? "ready" : "offline",
    }));
  }, [stopTimer]);

  const toggleMute = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin) return;
    const newMuted = !state.isMuted;
    try {
      await plugin.muteCall({ muted: newMuted });
      setState((s) => ({ ...s, isMuted: newMuted }));
    } catch {}
  }, [state.isMuted]);

  // Hold removed — native softphone uses direct dial, no conference participant.

  /**
   * Re-query the plugin's currently selected audio device and sync local state.
   * Called on connect, every 2s during a call, and after toggleSpeaker.
   * AudioSwitch in the native plugin auto-promotes BT > Wired > Earpiece/Speaker
   * whenever setSpeaker(false) is the active mode, so the device may change
   * without us doing anything (e.g. tech connects to truck stereo mid-call).
   */
  const refreshAudioDevice = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin?.getSelectedAudioDevice) return;
    try {
      const info = await plugin.getSelectedAudioDevice();
      const deviceName: string = info?.device || info?.name || "";
      const bt = /bluetooth|bt|headset/i.test(deviceName);
      const spk = /speaker/i.test(deviceName);
      setIsBluetooth(bt);
      setIsSpeaker(spk && !bt);
      setAudioDeviceLabel(
        bt ? (deviceName.replace(/bluetooth_?/i, "").trim() || "Bluetooth")
          : spk ? "Speaker"
          : "Earpiece"
      );

      // Diagnostics: log the full device list so techs' logcat shows what
      // AudioSwitch can actually see (vs. what's paired in OS Settings).
      if (plugin.getAvailableAudioDevices) {
        try {
          const list = await plugin.getAvailableAudioDevices();
          console.log("[NativeSoftphone] available audio devices:", list, "| selected:", deviceName);
        } catch {}
      }
    } catch (e) {
      console.warn("[NativeSoftphone] refreshAudioDevice failed:", e);
    }
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const plugin = getPlugin();
    if (!plugin) return;

    // Cycle: Bluetooth (auto) → Speaker → Earpiece → Bluetooth (auto)
    // We only have one knob — setSpeaker({ enabled }). When enabled:false,
    // AudioSwitch picks the highest-priority non-speaker route, which is
    // Bluetooth if a headset/car kit is connected, otherwise Earpiece.
    // The actual selected device is read back via refreshAudioDevice().
    let target: "speaker" | "auto";
    if (isSpeaker) {
      // Speaker → Earpiece (or BT if present)
      target = "auto";
    } else if (isBluetooth) {
      // BT → Speaker
      target = "speaker";
    } else {
      // Earpiece → Speaker
      target = "speaker";
    }

    console.log(`[NativeSoftphone] toggleSpeaker: current=${audioDeviceLabel} → target=${target}`);

    try {
      await plugin.setSpeaker({ enabled: target === "speaker" });
      // Give AudioSwitch a beat to actually swap routes, then re-read truth.
      setTimeout(() => { refreshAudioDevice(); }, 150);
    } catch (e) {
      console.error("[NativeSoftphone] setSpeaker failed:", e);
    }
  }, [isSpeaker, isBluetooth, audioDeviceLabel, refreshAudioDevice]);

  // Re-poll selected audio device every 2s while on a call so connecting
  // BT mid-call updates the UI label and confirms AudioSwitch promoted it.
  useEffect(() => {
    if (state.status !== "on-call") return;
    refreshAudioDevice();
    const id = setInterval(refreshAudioDevice, 2000);
    return () => clearInterval(id);
  }, [state.status, refreshAudioDevice]);

  const sendDigit = useCallback(async (digit: string) => {
    const plugin = getPlugin();
    if (!plugin?.sendDigits) return;
    try { await plugin.sendDigits({ digits: digit }); } catch {}
  }, []);

  const acceptWaitingCall = useCallback(async () => {}, []);

  const dismissWaitingCall = useCallback(async () => {}, []);

  const [pendingDialNumber, setPendingDialNumber] = useState<string | null>(null);
  const setDialNumber = useCallback((number: string) => setPendingDialNumber(number), []);
  const consumeDialNumber = useCallback(() => {
    const num = pendingDialNumber;
    setPendingDialNumber(null);
    return num;
  }, [pendingDialNumber]);

  // Cross-device sync: watch call_log for calls answered on another device
  useEffect(() => {
    const sid = incomingCallSidRef.current;
    if (state.status !== "ringing" || !state.incomingCall || !sid) return;

    const channel = supabase
      .channel(`call-sync-native-${sid}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "call_log",
        filter: `twilio_sid=eq.${sid}`,
      }, (payload: any) => {
        const newStatus = payload.new?.status;
        if (newStatus === "in-progress") {
          console.log("[NativeSoftphone] Call answered on another device — clearing ringing");
          const plugin = getPlugin();
          if (plugin && incomingCallSidRef.current) {
            try { plugin.rejectCall({ callSid: incomingCallSidRef.current }); } catch {}
          }
          incomingCallSidRef.current = null;
          setState((s) => ({
            ...s,
            incomingCall: null,
            callerInfo: null,
            status: registeredRef.current ? "ready" : "offline",
          }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [state.status, state.incomingCall]);

  // ── Stale call cleanup on app resume ──
  // When the app comes back from background, the WebView may have missed
  // callDisconnected / callInviteCancelled events. Check the call_log DB to
  // see if the supposedly-active call is actually completed, and if so, reset.
  const forceResetCallState = useCallback(() => {
    console.log("[NativeSoftphone] forceResetCallState — clearing phantom call");
    activeCallSidRef.current = null;
    incomingCallSidRef.current = null;
    stopTimer();
    setIsSpeaker(false);
    setIsBluetooth(false);
    setAudioDeviceLabel("Earpiece");
    setState((s) => ({
      ...s,
      activeCall: null,
      incomingCall: null,
      callerInfo: null,
      waitingCall: null,
      waitingCallerInfo: null,
      isMuted: false,
      callDuration: 0,
      status: registeredRef.current ? "ready" : "offline",
      error: null,
    }));
    // Also cancel lingering Android incoming-call notification
    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await LocalNotifications.cancel({ notifications: [{ id: 9999 }] });
        console.log("[NativeSoftphone] Cancelled lingering notification 9999");
      } catch {}
    })();
  }, [stopTimer]);

  useEffect(() => {
    if (!enabled) return;

    let removeNativeListener: (() => void) | null = null;
    let coldStartDone = false;

    const checkStaleCall = async (reason: string = "resume") => {
      const currentStatus = state.status;
      const trackedSid = activeCallSidRef.current || incomingCallSidRef.current;
      const hasIncoming = !!state.incomingCall;

      // Broadened gate: run check if we have ANY call-related state, not just active statuses
      const hasCallState = currentStatus === "ringing" || currentStatus === "on-call" || currentStatus === "connecting" || !!trackedSid || hasIncoming;
      if (!hasCallState) return;

      console.log(`[NativeSoftphone] checkStaleCall (${reason}): status=${currentStatus}, sid=${trackedSid}, hasIncoming=${hasIncoming}`);

      // Check if the native plugin actually has an active call
      const plugin = getPlugin();
      if (plugin?.getActiveCall) {
        try {
          const activeCall = await plugin.getActiveCall();
          if (!activeCall || !activeCall.callSid) {
            console.log("[NativeSoftphone] checkStaleCall: no active native call — resetting stale state");
            forceResetCallState();
            return;
          }
        } catch {
          // getActiveCall not available, fall through to DB check
        }
      }

      // Fallback: check DB for the call SID
      if (!trackedSid) {
        console.log("[NativeSoftphone] checkStaleCall: no tracked SID but has call state — resetting");
        forceResetCallState();
        return;
      }

      try {
        const { data } = await supabase
          .from("call_log")
          .select("status")
          .eq("twilio_sid", trackedSid)
          .maybeSingle();

        if (!data || ["completed", "no-answer", "busy", "failed", "canceled"].includes(data.status)) {
          console.log("[NativeSoftphone] checkStaleCall: call", trackedSid, "is", data?.status ?? "missing", "in DB — resetting");
          forceResetCallState();
        }
      } catch {
        // DB check failed, leave state as-is
      }
    };

    // Cold-start reconciliation: run once shortly after mount to catch
    // stale state that survives force stops / app kills
    const coldStartTimer = setTimeout(() => {
      if (!coldStartDone) {
        coldStartDone = true;
        checkStaleCall("cold-start");
      }
    }, 3000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkStaleCall("visibility");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    import("@capacitor/app")
      .then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) checkStaleCall("appStateChange");
        }).then((handle) => {
          removeNativeListener = () => handle.remove();
        });
      })
      .catch(() => {});

    return () => {
      clearTimeout(coldStartTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      removeNativeListener?.();
    };
  }, [enabled, state.status, state.incomingCall, forceResetCallState]);

  useEffect(() => {
    return () => {
      clearRegistrationTimeout();
      clearRegistrationRetries();
      stopTimer();
      for (const handle of listenerHandlesRef.current) {
        Promise.resolve(handle?.remove?.()).catch(() => {});
      }
      listenerHandlesRef.current = [];
      listenersRegisteredRef.current = false;
      try { getPlugin()?.logout?.(); } catch {}
    };
  }, [clearRegistrationRetries, clearRegistrationTimeout, stopTimer]);

  // Hold support indicator removed.

  return {
    ...state, isSpeaker, isBluetooth, audioDeviceLabel, pendingDialNumber,
    initialize,
    // No-op on native — Electron-specific recovery hook
    recoverIfNeeded: async () => {},
      dial, hangUp, toggleMute, toggleSpeaker,
    acceptCall, rejectCall, sendDigit,
    acceptWaitingCall, dismissWaitingCall,
    setDialNumber, consumeDialNumber,
    setPendingJobId, setPendingCustomerId,
    forceResetCallState,
  };
}
