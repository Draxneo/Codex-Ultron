import { useState, useEffect, useRef } from "react";
import { useLiveTranscript } from "@/hooks/useLiveTranscript";
import { toast } from "@/hooks/use-toast";
import {
  Phone, PhoneOff, PhoneIncoming, PhoneCall,
  Mic, MicOff, Keyboard, Delete, Wifi, WifiOff, User, ChevronDown, ChevronUp,
  ExternalLink, Volume2, Bluetooth,
} from "lucide-react";
import { isElectron, isElectronMain, sendToMain } from "@/lib/electron";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSoftphoneContext } from "./SoftphoneProvider";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { playDtmfTone } from "@/lib/softphoneAudio";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCompanySetting } from "@/lib/companySettings";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";

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

interface SoftphoneStripProps {
  onCallContextChange?: (ctx: string | null) => void;
  /** When true, hide the collapsible header and keep the dialer permanently expanded. Used for the Electron pop-out window. */
  alwaysExpanded?: boolean;
}

export function SoftphoneStrip({ onCallContextChange, alwaysExpanded = false }: SoftphoneStripProps) {
  const softphone = useSoftphoneContext();
  const { startCallSession, sendQuery } = useCopilotPanel();
  const [expanded, setExpanded] = useState(alwaysExpanded);
  const [dialInput, setDialInput] = useState("");
  const [showDialpad, setShowDialpad] = useState(false);

  const telephony = useTelephonyMode();

  // Consume pending dial number from ClickToCall
  useEffect(() => {
    if (softphone.pendingDialNumber) {
      setDialInput(softphone.pendingDialNumber);
      setExpanded(true);
      softphone.consumeDialNumber();
    }
  }, [softphone.pendingDialNumber]);

  const { data: dialTonesSetting } = useQuery({
    queryKey: ["company_settings", "softphone_dial_tones"],
    queryFn: () => getCompanySetting("softphone_dial_tones", "true"),
  });
  const dialTonesEnabled = dialTonesSetting !== "false";
  const isActive = ["connecting", "ringing", "on-call"].includes(softphone.status);
  const hasIncoming = softphone.status === "ringing" && !!softphone.incomingCall;
  const isOnCall = softphone.status === "on-call";
  const isConnecting = softphone.status === "connecting";
  const isReady = softphone.status === "ready" || softphone.status === "registering";

  const { liveTranscript, transcriptEndRef, liveTranscriptionEnabled } = useLiveTranscript(softphone.activeCall, isOnCall);

  // Track which call we've already screen-popped to avoid re-firing
  const screenPoppedCallRef = useRef<string | null>(null);
  // Track which calls we've already triggered post-call review for (by call_log id or phone)
  const processedCallIdsRef = useRef<Set<string>>(new Set());
  const lastCallInfoRef = useRef<{ phone: string; name?: string } | null>(null);

  // Auto-expand on call activity
  useEffect(() => {
    if (hasIncoming || isConnecting || isOnCall) {
      setExpanded(true);
    }
  }, [hasIncoming, isConnecting, isOnCall]);

  // ── Screen Pop + Copilot auto-launch on incoming ring ──
  useEffect(() => {
    if (!hasIncoming || !softphone.incomingCall) return;

    const callSid = (softphone.incomingCall as any)?.parameters?.CallSid || "";
    const callKey = callSid || softphone.callerInfo?.number || "unknown";

    // Only fire once per unique incoming call
    if (screenPoppedCallRef.current === callKey) return;
    screenPoppedCallRef.current = callKey;

    const phone = softphone.callerInfo?.number || "";
    const contactName = softphone.callerInfo?.name;

    // 1) Electron: open/focus the phone pop-out window
    if (isElectron()) {
      const launchTargets = telephony.getSurfaceLaunchTargets("calls");
      sendToMain("screen-pop", {
        phone,
        contactName,
        shouldLaunchUltraphone: false,
        appUrl: launchTargets.appUrl,
        webUrl: launchTargets.webUrl,
      });
    }

    // 2) Copilot: auto-launch customer lookup for the dispatcher
    if (phone) {
      startCallSession(phone, contactName, callSid);
    }
  }, [hasIncoming, softphone.incomingCall, softphone.callerInfo, telephony]);

  // ── Track caller info while on call so we can use it after hang-up ──
  useEffect(() => {
    if (isOnCall && softphone.callerInfo?.number) {
      lastCallInfoRef.current = {
        phone: softphone.callerInfo.number,
        name: softphone.callerInfo.name,
      };
    }
  }, [isOnCall, softphone.callerInfo]);

  // ── Auto-trigger JARVIS post-call review when call ends (softphone calls) ──
  useEffect(() => {
    // Fire when we transition away from on-call and have stored call info
    if (isOnCall || !lastCallInfoRef.current) return;

    const { phone, name } = lastCallInfoRef.current;
    const callKey = phone;

    // Only fire once per call
    if (processedCallIdsRef.current.has(callKey)) return;
    processedCallIdsRef.current.add(callKey);

    // Clear for next call
    lastCallInfoRef.current = null;

    // Small delay to let summarize-call edge function start processing
    const timer = setTimeout(() => {
      const nameHint = name ? `${name} (${phone})` : phone;
      sendQuery(
        `The call with ${nameHint} just ended. Review the call log and any transcription/summary for this number. What actions should I take — should I book a job, send a follow-up, or create a customer record? Show me the options.`
      );
    }, 3000);

    return () => clearTimeout(timer);
  }, [isOnCall, sendQuery]);

  // ── Realtime listener: trigger JARVIS for completed INBOUND calls not handled in softphone ──
  useEffect(() => {
    const channel = supabase
      .channel("softphone-inbound-complete")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_log",
          filter: "direction=eq.inbound",
        },
        (payload: any) => {
          const row = payload.new;
          // Only fire for completed status
          if (row.status !== "completed") return;
          // Staleness guard: ignore calls older than 5 minutes
          const callAge = Date.now() - new Date(row.created_at).getTime();
          if (callAge > 5 * 60 * 1000) return;
          // Skip if already processed (by call ID or phone number from softphone trigger)
          if (processedCallIdsRef.current.has(row.id) || processedCallIdsRef.current.has(row.phone_number)) return;

          // Mark both ID and phone so neither path double-fires
          processedCallIdsRef.current.add(row.id);
          processedCallIdsRef.current.add(row.phone_number);

          // Cap set size to prevent memory leak over long sessions
          if (processedCallIdsRef.current.size > 100) {
            const entries = Array.from(processedCallIdsRef.current);
            processedCallIdsRef.current = new Set(entries.slice(-50));
          }

          // Delay to let summarize-call finish processing
          setTimeout(() => {
            const nameHint = row.contact_name
              ? `${row.contact_name} (${row.phone_number})`
              : row.phone_number;
            sendQuery(
              `The call with ${nameHint} just ended. Review the call log and any transcription/summary for this number. What actions should I take — should I book a job, send a follow-up, or create a customer record? Show me the options.`
            );
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sendQuery]);


  // Call-waiting toast removed — 2nd inbound calls are now auto-rejected by
  // the softphone hooks (and routed by the server to a fallback employee or
  // voicemail) so the user is never interrupted mid-conversation.

  // (Live transcript logic moved to useLiveTranscript hook)

  // Push call context up to Copilot (include transcript)
  useEffect(() => {
    if (isOnCall && softphone.callerInfo) {
      const name = softphone.callerInfo.name || "Unknown";
      const twilioSid = (softphone.activeCall as any)?.parameters?.CallSid || "";
      const transcriptText = liveTranscript
        .filter((t) => t.is_final)
        .map((t) => t.text)
        .join(" ");
      // Keep last ~500 words to stay within context limits
      const words = transcriptText.split(/\s+/);
      const trimmedTranscript = words.length > 500 ? words.slice(-500).join(" ") : transcriptText;
      const transcriptCtx = trimmedTranscript
        ? `\n\nLive transcript so far:\n"${trimmedTranscript}"`
        : "";
      const sidCtx = twilioSid ? `\nActive call twilio_sid: ${twilioSid}` : "";
      onCallContextChange?.(`Currently on a phone call with ${name} (${softphone.callerInfo.number}). Duration: ${formatDuration(softphone.callDuration)}.${sidCtx}${transcriptCtx}`);
    } else if (!isActive) {
      onCallContextChange?.(null);
    }
  }, [isOnCall, isActive, softphone.callerInfo, softphone.callDuration, onCallContextChange, liveTranscript]);

  const handleDial = () => {
    if (!dialInput.trim()) return;
    const digits = dialInput.replace(/\D/g, "");
    const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : `+${digits}`;
    // Trigger Copilot customer lookup before dialing
    const resolvedName = softphone.callerInfo?.name;
    startCallSession(dialInput, resolvedName);
    softphone.dial(e164);
    setDialInput("");
  };

  const handleDigitPress = (digit: string) => {
    if (dialTonesEnabled) playDtmfTone(digit);
    if (isActive && softphone.activeCall) {
      softphone.sendDigit(digit);
    } else {
      setDialInput((prev) => prev + digit);
    }
  };

  // ── Status dot color
  const statusDot = isOnCall
    ? "bg-[hsl(var(--success))]"
    : isReady
      ? "bg-[hsl(var(--success)/0.6)]"
      : hasIncoming
        ? "bg-[hsl(var(--success))] animate-pulse"
        : isConnecting
          ? "bg-accent animate-pulse"
          : "bg-muted-foreground/40";

  // On Electron main window, show a minimal strip — no Twilio Device here
  if (isElectronMain()) {
    return (
      <div className="border-b shrink-0">
        <button
          onClick={() => sendToMain("ensure-phone-window")}
          className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/5"
        >
          <div className="relative">
            <Phone className="h-3.5 w-3.5 text-accent" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-[hsl(var(--success)/0.6)]" />
          </div>
          <span className="text-xs text-muted-foreground flex-1">Open Phone</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <Collapsible open={alwaysExpanded ? true : expanded} onOpenChange={alwaysExpanded ? () => {} : setExpanded} className={cn(!alwaysExpanded && "border-b", alwaysExpanded ? "flex-1 min-h-0 flex flex-col" : "shrink-0")}>
      {/* ── Collapsed strip (hidden in pop-out where the dialer is the entire window) ── */}
      {!alwaysExpanded && (
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/5",
              isActive && "bg-accent/5"
            )}
          >
            <div className="relative">
              <Phone className="h-3.5 w-3.5 text-accent" />
              <span className={cn("absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background", statusDot)} />
            </div>

            {isOnCall ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-xs font-semibold text-foreground truncate">
                  {softphone.callerInfo?.name || softphone.callerInfo?.number || "On Call"}
                </span>
                <span className="text-[10px] font-mono text-[hsl(var(--success))]">{formatDuration(softphone.callDuration)}</span>
              </div>
            ) : hasIncoming ? (
              <span className="text-xs font-semibold text-[hsl(var(--success))] animate-pulse flex-1">Incoming Call</span>
            ) : (
              <span className="text-xs text-muted-foreground flex-1">Phone</span>
            )}

            {isElectron() && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  sendToMain("pop-out-phone");
                }}
                className="p-1 rounded hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                title="Pop out phone to separate window"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            )}

            {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>
      )}

      {/* ── Expanded content ── */}
      <CollapsibleContent className={cn("px-3 pb-3 space-y-3 pt-3", alwaysExpanded && "flex-1 min-h-0 flex flex-col") }>

        {/* Incoming call */}
        {hasIncoming && (
          <div className="text-center space-y-2 py-2">
            <div className="mx-auto h-10 w-10 rounded-full bg-[hsl(var(--success)/0.1)] flex items-center justify-center">
              <User className="h-5 w-5 text-[hsl(var(--success))]" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Incoming</p>
              <p className="text-sm font-bold text-foreground">{softphone.callerInfo?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground font-mono">{softphone.callerInfo?.number}</p>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={(e) => { e.stopPropagation(); softphone.rejectCall(); }}
                className="h-10 w-10 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center active:scale-95"
              >
                <PhoneOff className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  softphone.acceptCall();
                  // Trigger Copilot CSR intake for inbound calls
                  const callerNumber = softphone.callerInfo?.number || "";
                  const callerName = softphone.callerInfo?.name;
                  const callSid = (softphone.incomingCall as any)?.parameters?.CallSid;
                  startCallSession(callerNumber, callerName, callSid);
                }}
                className="h-10 w-10 rounded-full bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] flex items-center justify-center active:scale-95"
              >
                <Phone className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Active call display */}
        {isActive && !hasIncoming && (
          <div className="text-center space-y-2 py-1">
            <div>
              {softphone.callerInfo?.name && (
                <p className="text-sm font-bold text-foreground">{softphone.callerInfo.name}</p>
              )}
              <p className="text-xs text-muted-foreground font-mono">{softphone.callerInfo?.number || "Connecting..."}</p>
              {isOnCall && (
                <p className="text-xs font-mono text-[hsl(var(--success))] mt-0.5">{formatDuration(softphone.callDuration)}</p>
              )}
              {isConnecting && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse [animation-delay:300ms]" />
                </div>
              )}
            </div>
            <div className="flex gap-1.5 justify-center">
              <button
                onClick={softphone.toggleMute}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-95",
                  softphone.isMuted ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                title={softphone.isMuted ? "Unmute" : "Mute"}
              >
                {softphone.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setShowDialpad((p) => !p)}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-95",
                  showDialpad ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                title="Keypad"
              >
                <Keyboard className="h-4 w-4" />
              </button>
              {softphone.audioRouting.isNative && (
                <button
                  onClick={softphone.audioRouting.toggleSpeaker}
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-95",
                    softphone.audioRouting.isSpeaker ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                  title={softphone.audioRouting.isBluetooth ? "Bluetooth" : softphone.audioRouting.isSpeaker ? "Speaker On" : "Speaker Off"}
                >
                  {softphone.audioRouting.isBluetooth ? <Bluetooth className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={softphone.hangUp}
                className="h-9 w-9 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center active:scale-95"
                title="End call"
              >
                <PhoneOff className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Live transcript moved to CSR intake popout window */}

        {/* Dial pad */}
        {(!isActive || showDialpad) && (
          <div className={cn("space-y-2 overflow-hidden", alwaysExpanded && "flex-1 min-h-0 flex flex-col") }>
            {!isActive && (
              <div className="relative">
                <input
                  type="tel"
                  value={dialInput}
                  onChange={(e) => setDialInput(e.target.value)}
                  placeholder="Enter number"
                  className="w-full text-center text-base font-semibold tracking-widest rounded-lg border-0 bg-muted/50 px-8 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") handleDial(); }}
                />
                {dialInput && (
                  <button
                    onClick={() => setDialInput((p) => p.slice(0, -1))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <Delete className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <div
              className={cn(
                "grid min-h-0 grid-cols-3 gap-1.5",
                alwaysExpanded && "flex-1 grid-rows-4 content-stretch",
                !alwaysExpanded && (isActive ? "auto-rows-fr" : "auto-rows-[minmax(0,1fr)]")
              )}
            >
              {DIAL_KEYS.map((row) =>
                row.map(({ key, sub }) => (
                  <button
                    key={key}
                    onClick={() => handleDigitPress(key)}
                    className={cn(
                      "min-h-0 rounded-lg bg-muted/60 text-foreground transition-all active:scale-[0.96] hover:bg-muted flex flex-col items-center justify-center",
                      alwaysExpanded ? "h-full px-1 py-2" : "h-10"
                    )}
                  >
                    <span className="text-sm font-semibold leading-none">{key}</span>
                    {sub !== undefined && (
                      <span className="text-[7px] font-medium text-muted-foreground tracking-widest leading-none mt-0.5">{sub || "\u00A0"}</span>
                    )}
                  </button>
                ))
              )}
            </div>
            {!isActive && (
              <button
                onClick={handleDial}
                disabled={!dialInput.trim()}
                className={cn(
                  "w-full h-9 rounded-lg flex items-center justify-center gap-1.5 font-semibold text-xs transition-all active:scale-[0.98]",
                  dialInput.trim()
                    ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] shadow-sm"
                    : "bg-[hsl(var(--success)/0.3)] text-[hsl(var(--success-foreground)/0.6)] cursor-not-allowed"
                )}
              >
                <Phone className="h-3.5 w-3.5" />
                Call
              </button>
            )}
          </div>
        )}


        {/* Connect / offline / reconnecting */}
        {softphone.status === "registering" && !hasIncoming && (
          <div className="w-full h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center gap-1.5 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse [animation-delay:300ms]" />
            <span className="ml-1">Connecting phone…</span>
          </div>
        )}

        {(softphone.status === "offline" || softphone.status === "error") && !hasIncoming && (
          <button
            onClick={softphone.initialize}
            className="w-full h-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-[hsl(var(--warm))] transition-colors active:scale-[0.98]"
          >
            <Wifi className="h-3.5 w-3.5" />
            {softphone.status === "error" ? "Reconnect Softphone" : "Connect Softphone"}
          </button>
        )}

        {softphone.error && (
          <p className="text-[10px] text-destructive bg-destructive/5 rounded-md px-2 py-1.5 truncate">{softphone.error}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
