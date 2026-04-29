/**
 * MobileCallScreen — Full-screen native-feel phone call overlay for mobile devices.
 * Renders over everything when a call is active on mobile.
 */
import { useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, Keyboard, User, X, Bluetooth } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSoftphoneContext } from "./SoftphoneProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { playDtmfTone } from "@/lib/softphoneAudio";

import { useProximitySensor } from "@/hooks/useProximitySensor";
import { useAmdStatus } from "@/hooks/useAmdStatus";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const DIAL_KEYS: { key: string; sub?: string }[][] = [
  [{ key: "1", sub: "" }, { key: "2", sub: "ABC" }, { key: "3", sub: "DEF" }],
  [{ key: "4", sub: "GHI" }, { key: "5", sub: "JKL" }, { key: "6", sub: "MNO" }],
  [{ key: "7", sub: "PQRS" }, { key: "8", sub: "TUV" }, { key: "9", sub: "WXYZ" }],
  [{ key: "*" }, { key: "0", sub: "+" }, { key: "#" }],
];

export function MobileCallScreen() {
  const softphone = useSoftphoneContext();
  const isMobile = useIsMobile();
  const audioRouting = softphone.audioRouting;
  const [showKeypad, setShowKeypad] = useState(false);

  const isActive = ["connecting", "ringing", "on-call"].includes(softphone.status);
  const isOnCall = softphone.status === "on-call";

  // Proximity sensor — dims screen when held to ear
  useProximitySensor(isOnCall);

  const hasIncoming = softphone.status === "ringing" && !!softphone.incomingCall;
  const isConnecting = softphone.status === "connecting";

  // AMD detection — outbound voicemail awareness (must run before any early return)
  const amdStatus = useAmdStatus(isConnecting || isOnCall);

  // Only show on mobile for incoming calls. Active/connecting calls stay in
  // the compact persistent bar rendered by MobileShell.
  if (!isMobile || !isActive || !hasIncoming) return null;

  const callerName = softphone.callerInfo?.name || "Unknown";
  const callerNumber = softphone.callerInfo?.number || "";

  const handleDigit = (digit: string) => {
    playDtmfTone(digit);
    softphone.sendDigit(digit);
  };

  // Incoming call screen
  if (hasIncoming) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-[hsl(var(--background))] to-[hsl(var(--muted))] flex flex-col items-center justify-between py-16 px-6">
        <div className="flex flex-col items-center gap-3 mt-8">
          <div className="h-20 w-20 rounded-full bg-accent/10 flex items-center justify-center ring-4 ring-accent/20">
            <User className="h-10 w-10 text-accent" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{callerName}</p>
            <p className="text-base text-muted-foreground font-mono mt-1">{callerNumber}</p>
          </div>
          <p className="text-sm text-muted-foreground animate-pulse mt-2">Incoming call...</p>
        </div>

        <div className="flex items-center justify-center gap-16 mb-8">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={softphone.rejectCall}
              className="h-16 w-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg active:scale-90 transition-transform"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className="text-xs text-muted-foreground">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={softphone.acceptCall}
              className="h-16 w-16 rounded-full bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] flex items-center justify-center shadow-lg active:scale-90 transition-transform animate-pulse"
            >
              <Phone className="h-7 w-7" />
            </button>
            <span className="text-xs text-muted-foreground">Accept</span>
          </div>
        </div>
      </div>
    );
  }

  // AMD banner derivation (hook itself runs above the early return)
  const amdBanner = (() => {
    if (!amdStatus || amdStatus === "human") return null;
    if (amdStatus === "machine_start") {
      return { text: "📼 Voicemail detected — wait for the beep…", tone: "warn" as const };
    }
    if (amdStatus === "machine_end_beep" || amdStatus === "machine_end_silence" || amdStatus === "machine_end_other") {
      return { text: "🔴 Leave your message now", tone: "rec" as const };
    }
    if (amdStatus === "fax") return { text: "📠 Fax machine detected", tone: "warn" as const };
    return null;
  })();

  // Active / connecting call screen
  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-[hsl(var(--background))] to-[hsl(var(--muted))] flex flex-col items-center justify-between py-12 px-6">
      <div className="flex flex-col items-center gap-2 mt-6">
        <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center">
          <User className="h-8 w-8 text-accent" />
        </div>
        <p className="text-xl font-bold text-foreground">{callerName}</p>
        <p className="text-sm text-muted-foreground font-mono">{callerNumber}</p>
        {isConnecting && (
          <p className="text-sm text-muted-foreground animate-pulse">Calling...</p>
        )}
        {isOnCall && (
          <p className="text-lg font-mono text-[hsl(var(--success))] font-semibold">
            {formatDuration(softphone.callDuration)}
          </p>
        )}
        {amdBanner && (
          <div
            className={cn(
              "mt-3 px-4 py-2 rounded-full text-sm font-medium shadow-md border",
              amdBanner.tone === "warn"
                ? "bg-accent/15 text-accent-foreground border-accent/30"
                : "bg-destructive/15 text-destructive border-destructive/30 animate-pulse"
            )}
          >
            {amdBanner.text}
          </div>
        )}
      </div>

      {showKeypad ? (
        <div className="w-full max-w-[280px] space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {DIAL_KEYS.map((row) =>
              row.map(({ key, sub }) => (
                <button
                  key={key}
                  onClick={() => handleDigit(key)}
                  className="h-14 rounded-2xl flex flex-col items-center justify-center bg-muted/60 hover:bg-muted text-foreground transition-all active:scale-[0.94]"
                >
                  <span className="text-lg font-semibold leading-none">{key}</span>
                  {sub !== undefined && (
                    <span className="text-[8px] font-medium text-muted-foreground tracking-widest mt-0.5">{sub || "\u00A0"}</span>
                  )}
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => setShowKeypad(false)}
            className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground py-2"
          >
            <X className="h-3 w-3" /> Hide keypad
          </button>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="w-full max-w-[300px] space-y-6 mb-4">
        <div className="flex items-center justify-around">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={softphone.toggleMute}
              className={cn(
                "h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-90",
                softphone.isMuted
                  ? "bg-foreground text-background"
                  : "bg-muted/80 text-foreground"
              )}
            >
              {softphone.isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            <span className="text-[10px] text-muted-foreground">
              {softphone.isMuted ? "Unmute" : "Mute"}
            </span>
          </div>


          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setShowKeypad((p) => !p)}
              className={cn(
                "h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-90",
                showKeypad
                  ? "bg-foreground text-background"
                  : "bg-muted/80 text-foreground"
              )}
            >
              <Keyboard className="h-6 w-6" />
            </button>
            <span className="text-[10px] text-muted-foreground">Keypad</span>
          </div>

          {audioRouting.isNative && (
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={audioRouting.toggleSpeaker}
                className={cn(
                  "h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-90",
                  audioRouting.isSpeaker
                    ? "bg-foreground text-background"
                    : "bg-muted/80 text-foreground"
                )}
              >
                {audioRouting.isBluetooth ? <Bluetooth className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
              </button>
              <span className="text-[10px] text-muted-foreground">
                {audioRouting.deviceLabel || (audioRouting.isBluetooth ? "BT" : audioRouting.isSpeaker ? "Speaker" : "Earpiece")}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <button
            onClick={softphone.hangUp}
            className="h-16 w-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg active:scale-90 transition-transform"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}
