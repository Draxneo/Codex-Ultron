import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSoftphone } from "@/hooks/useSoftphone";
import { useNativeSoftphone } from "@/hooks/useNativeSoftphone";
import { useCapacitor } from "@/hooks/useCapacitor";
import { useMediaPauseOnCall } from "@/hooks/useMediaPauseOnCall";
import { useAuth } from "@/hooks/useAuth";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { useCallForegroundService } from "@/hooks/useCallForegroundService";
import { setOnCall } from "@/lib/callStateBus";
import { isElectron, sendToMain } from "@/lib/electron";
import { supabase } from "@/integrations/supabase/client";
import { getCompanySetting } from "@/lib/companySettings";
import { startRingtone, stopRingtone, isCustomRingtone } from "@/lib/softphoneAudio";

// Statuses where the user is engaged on (or about to be engaged on) a call.
// Suppresses voice announcements (JARVIS) and notification toasts so nothing
// distracts. `ringing` is included so an SMS that arrives mid-ring doesn't
// start TTS that keeps playing after the user answers — incoming-call alerts
// bypass this gate via { force: true } in AnnouncerProvider.
const ACTIVE_CALL_STATUSES = new Set(["ringing", "connecting", "on-call"]);

type NativeAudioRouting = {
  isSpeaker: boolean;
  isBluetooth: boolean;
  isNative: boolean;
  toggleSpeaker: () => void;
  deviceLabel?: string;
};

type SoftphoneContextType = ReturnType<typeof useSoftphone> & {
  audioRouting: NativeAudioRouting;
};

const disabledSoftphoneValue: SoftphoneContextType = {
  status: "offline",
  activeCall: null,
  isMuted: false,
  callDuration: 0,
  callerInfo: null,
  incomingCall: null,
  waitingCall: null,
  waitingCallerInfo: null,
  error: null,
  pendingDialNumber: null,
  initialize: async () => {},
  recoverIfNeeded: async () => {},
  dial: async () => {},
  setPendingJobId: () => {},
  hangUp: () => {},
  toggleMute: () => {},
  acceptCall: () => {},
  rejectCall: () => {},
  sendDigit: () => {},
  acceptWaitingCall: () => {},
  dismissWaitingCall: () => {},
  setDialNumber: () => {},
  setPendingCustomerId: () => {},
  consumeDialNumber: () => null,
  audioRouting: {
    isSpeaker: false,
    isBluetooth: false,
    isNative: false,
    toggleSpeaker: () => {},
    deviceLabel: "Speaker",
  },
};

const SoftphoneContext = createContext<SoftphoneContextType | null>(null);

function SoftphoneRingtoneController({ softphone }: { softphone: SoftphoneContextType }) {
  const { data: ringtoneSetting } = useQuery({
    queryKey: ["company_settings", "softphone_ringtone"],
    queryFn: () => getCompanySetting("softphone_ringtone", "classic"),
  });

  useEffect(() => {
    const isIncomingRing = softphone.status === "ringing" && !!softphone.incomingCall;
    const isOutboundRingback =
      (softphone.status === "connecting" || softphone.status === "ringing") &&
      !!softphone.activeCall &&
      !softphone.incomingCall;

    if (!isIncomingRing && !isOutboundRingback) {
      stopRingtone();
      return;
    }

    const ringtoneId = ringtoneSetting || "classic";
    let customUrl: string | undefined;
    if (isCustomRingtone(ringtoneId)) {
      const fileName = ringtoneId.replace("custom:", "");
      customUrl = supabase.storage.from("ringtones").getPublicUrl(fileName).data.publicUrl;
    }

    startRingtone(ringtoneId, customUrl);
    return () => stopRingtone();
  }, [softphone.status, softphone.incomingCall, softphone.activeCall, ringtoneSetting]);

  return null;
}

function ActiveSoftphoneProvider({ children, employeeId }: { children: ReactNode; employeeId: string | null }) {
  const { isNative, platform } = useCapacitor();

  const webSoftphone = useSoftphone(!isNative);
  const nativeSoftphone = useNativeSoftphone(isNative);

  console.log(`[SoftphoneProvider] using ${isNative ? "native" : "web"} softphone on ${platform}`);

  const activeStatus = isNative ? nativeSoftphone.status : webSoftphone.status;
  useMediaPauseOnCall(activeStatus);
  useKeepAwake();

  const isOnCall = activeStatus === "on-call";
  const isSoftphoneRegistered = !["offline", "error"].includes(activeStatus);
  useCallForegroundService(isSoftphoneRegistered, isOnCall);

  // Push call state into the module-level bus so non-React code (announcer,
  // notification gates) sees the change instantly.
  useEffect(() => {
    setOnCall(ACTIVE_CALL_STATUSES.has(activeStatus));
  }, [activeStatus]);

  useEffect(() => {
    if (!employeeId) return;

    const routeReady = ["ready", "ringing", "connecting", "on-call"].includes(activeStatus);
    const surface = isNative ? `native-${platform}` : isElectron() ? "electron" : "web";

    const writePresence = async (ready: boolean) => {
      const patch: Record<string, unknown> = {
        softphone_route_ready: ready,
        softphone_surface: surface,
      };
      if (ready) patch.softphone_last_seen = new Date().toISOString();

      const { error } = await supabase
        .from("employees")
        .update(patch as any)
        .eq("id", employeeId);

      if (error) {
        console.warn("[SoftphoneProvider] Failed to update softphone route presence:", error.message);
      }
    };

    void writePresence(routeReady);

    if (!routeReady) return;

    const timer = window.setInterval(() => {
      void writePresence(true);
    }, 20_000);

    return () => {
      window.clearInterval(timer);
      void writePresence(false);
    };
  }, [activeStatus, employeeId, isNative, platform]);

  const value: SoftphoneContextType = isNative
    ? {
        ...nativeSoftphone,
        audioRouting: {
          isSpeaker: nativeSoftphone.isSpeaker,
          isBluetooth: nativeSoftphone.isBluetooth,
          isNative: true,
          toggleSpeaker: nativeSoftphone.toggleSpeaker,
          deviceLabel: nativeSoftphone.audioDeviceLabel,
        },
      }
    : {
        ...webSoftphone,
        audioRouting: {
          isSpeaker: false,
          isBluetooth: false,
          isNative: false,
          toggleSpeaker: () => {},
          deviceLabel: "Speaker",
        },
      };

  return (
    <SoftphoneContext.Provider value={value}>
      <SoftphoneRingtoneController softphone={value} />
      {children}
    </SoftphoneContext.Provider>
  );
}

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, employeeId } = useAuth();
  const { isNative } = useCapacitor();
  const isPhoneConsole = location.pathname === "/phone-console" || new URLSearchParams(location.search).get("view") === "softphone";

  const publicPrefixes = [
    "/login",
    "/reset-password",
    "/form/",
    "/photos/",
    "/portal/",
    "/refer/",
    "/presentation/",
    "/agreement/",
    "/certificate/",
    "/invoice/",
    "/intake/",
    "/subcontractor/",
  ];

  const isPublicRoute = publicPrefixes.some((prefix) =>
    location.pathname === prefix || location.pathname.startsWith(prefix)
  );

  const shouldEnableSoftphone = !isPublicRoute && Boolean(user) && (isPhoneConsole || isNative);

  useEffect(() => {
    sendToMain("telephony-policy-updated", {
      isHandoff: false,
      softphoneEnabled: shouldEnableSoftphone,
      callTargets: null,
    });
  }, [shouldEnableSoftphone]);

  if (!shouldEnableSoftphone) {
    return <SoftphoneContext.Provider value={disabledSoftphoneValue}>{children}</SoftphoneContext.Provider>;
  }

  return <ActiveSoftphoneProvider employeeId={employeeId}>{children}</ActiveSoftphoneProvider>;
}

export function useSoftphoneContext() {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    console.warn("useSoftphoneContext called outside SoftphoneProvider; falling back to disabled softphone state.");
    return disabledSoftphoneValue;
  }
  return ctx;
}
