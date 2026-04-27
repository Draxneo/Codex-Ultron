import { useEffect, useState } from "react";
import { Phone, PhoneOff, Voicemail, Wifi, Delete, Bot } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CallPanel } from "@/components/CallPanel";
import { VoicemailPanel } from "@/components/VoicemailPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { playDtmfTone } from "@/lib/softphoneAudio";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getCompanySetting } from "@/lib/companySettings";

const DIAL_KEYS: { key: string; sub?: string }[][] = [
  [{ key: "1", sub: "" }, { key: "2", sub: "ABC" }, { key: "3", sub: "DEF" }],
  [{ key: "4", sub: "GHI" }, { key: "5", sub: "JKL" }, { key: "6", sub: "MNO" }],
  [{ key: "7", sub: "PQRS" }, { key: "8", sub: "TUV" }, { key: "9", sub: "WXYZ" }],
  [{ key: "*" }, { key: "0", sub: "+" }, { key: "#" }],
];

function MobileDialPad() {
  const softphone = useSoftphoneContext();
  const [dialInput, setDialInput] = useState("");
  const [showDialpad, setShowDialpad] = useState(true);

  // Consume pending dial number from ClickToCall
  useEffect(() => {
    if (softphone.pendingDialNumber) {
      setDialInput(softphone.pendingDialNumber);
      softphone.consumeDialNumber();
    }
  }, [softphone.pendingDialNumber]);

  const { data: dialTonesSetting } = useQuery({
    queryKey: ["company_settings", "softphone_dial_tones"],
    queryFn: () => getCompanySetting("softphone_dial_tones", "true"),
  });

  const dialTonesEnabled = dialTonesSetting !== "false";
  const isActive = ["connecting", "ringing", "on-call"].includes(softphone.status);
  const isOnCall = softphone.status === "on-call";
  const isReady = softphone.status === "ready";
  const isOffline = softphone.status === "offline";

  const handleDigitPress = (digit: string) => {
    if (dialTonesEnabled) playDtmfTone(digit);
    if (isActive && softphone.activeCall) {
      softphone.sendDigit(digit);
    } else {
      setDialInput((prev) => prev + digit);
    }
  };

  const handleDial = () => {
    if (!dialInput.trim()) return;
    const digits = dialInput.replace(/\D/g, "");
    const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : `+${digits}`;
    softphone.dial(e164);
    setDialInput("");
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const statusDot = isOnCall
    ? "bg-[hsl(var(--success))]"
    : isReady
      ? "bg-[hsl(var(--success)/0.6)]"
      : "bg-muted-foreground/40";

  return (
    <div className="p-4 space-y-4">
      {/* Status indicator */}
      <div className="flex items-center justify-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", statusDot)} />
        <span className="text-xs font-medium text-muted-foreground">
          {isOnCall ? "On Call" : isReady ? "Ready" : isOffline ? "Offline" : softphone.status}
        </span>
      </div>

      {/* Active call display */}
      {isActive && (
        <div className="text-center space-y-3 py-2">
          <div>
            {softphone.callerInfo?.name && (
              <p className="text-lg font-bold text-foreground">{softphone.callerInfo.name}</p>
            )}
            <p className="text-sm text-muted-foreground font-mono">{softphone.callerInfo?.number || "Connecting..."}</p>
            {isOnCall && (
              <p className="text-sm font-mono text-[hsl(var(--success))] mt-1">{formatDuration(softphone.callDuration)}</p>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={softphone.toggleMute}
              className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center transition-all active:scale-95",
                softphone.isMuted ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              )}
            >
              {softphone.isMuted ? (
                <span className="text-xs font-semibold">Muted</span>
              ) : (
                <span className="text-xs font-semibold">Mute</span>
              )}
            </button>
            <button
              onClick={softphone.hangUp}
              className="h-12 w-12 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center active:scale-95"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Dial input */}
      {!isActive && (
        <div className="relative">
          <input
            type="tel"
            value={dialInput}
            onChange={(e) => setDialInput(e.target.value)}
            placeholder="Enter number"
            className="w-full text-center text-2xl font-semibold tracking-widest rounded-xl border-0 bg-muted/50 px-10 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
            onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") handleDial(); }}
          />
          {dialInput && (
            <button
              onClick={() => setDialInput((p) => p.slice(0, -1))}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <Delete className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Dial pad grid */}
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {DIAL_KEYS.map((row) =>
          row.map(({ key, sub }) => (
            <button
              key={key}
              onClick={() => handleDigitPress(key)}
              className="h-14 rounded-xl flex flex-col items-center justify-center bg-muted/60 hover:bg-muted text-foreground transition-all active:scale-[0.96]"
            >
              <span className="text-lg font-semibold leading-none">{key}</span>
              {sub !== undefined && (
                <span className="text-[8px] font-medium text-muted-foreground tracking-widest leading-none mt-0.5">{sub || "\u00A0"}</span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Call button */}
      {!isActive && (
        <div className="flex justify-center">
          <button
            onClick={handleDial}
            disabled={!dialInput.trim()}
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-[0.95]",
              dialInput.trim()
                ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] shadow-lg"
                : "bg-[hsl(var(--success)/0.3)] text-[hsl(var(--success-foreground)/0.6)] cursor-not-allowed"
            )}
          >
            <Phone className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* Connect button if offline */}
      {isOffline && (
        <button
          onClick={softphone.initialize}
          className="w-full h-11 rounded-xl bg-accent text-accent-foreground flex items-center justify-center gap-2 text-sm font-medium hover:bg-accent/90 transition-colors active:scale-[0.98]"
        >
          <Wifi className="h-4 w-4" />
          Connect Softphone
        </button>
      )}

      {softphone.error && (
        <p className="text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2 text-center">{softphone.error}</p>
      )}
    </div>
  );
}

export default function CallsPage({ embedded = false, defaultTab = "calls" }: { embedded?: boolean; defaultTab?: string }) {
  const { unreadCount } = useVoicemails();
  const isMobile = useIsMobile();
  const softphone = useSoftphoneContext();
  const [hideBots, setHideBots] = useState(true);

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      {!embedded && !isMobile && <AppHeader />}
      <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-4 py-1 border-b shrink-0 bg-card">
          <TabsList className="bg-transparent h-8 p-0 gap-1">
            <TabsTrigger value="calls" className="gap-1 text-xs h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Phone className="h-3.5 w-3.5" /> {isMobile ? "Dialpad" : "Calls"}
            </TabsTrigger>
            <TabsTrigger value="voicemail" className="gap-1 text-xs h-7 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground relative">
              <Voicemail className="h-3.5 w-3.5" /> Voicemail
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 min-w-[16px] text-[9px] px-1">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          {/* Suspected-bot filter toggle — only meaningful on the Calls tab */}
          <button
            type="button"
            onClick={() => setHideBots((v) => !v)}
            title={hideBots
              ? "Hiding callers who hung up in the IVR without pressing 1 or 2 (suspected bots). Click to show them."
              : "Showing all calls including suspected bots (callers who hung up without pressing 1 or 2). Click to hide bots."}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium rounded-md border transition-colors",
              hideBots
                ? "bg-muted text-foreground border-border hover:bg-muted/80"
                : "bg-background text-muted-foreground border-border/60 hover:bg-muted/50"
            )}
          >
            <Bot className="h-3.5 w-3.5" />
            {hideBots ? "Bots hidden" : "Showing bots"}
          </button>
        </div>
        <TabsContent value="calls" className="flex-1 min-h-0 m-0 overflow-y-auto">
          {isMobile ? (
            <div className="flex flex-col">
              <MobileDialPad />
              <div className="border-t">
                <CallPanel hideBots={hideBots} />
              </div>
            </div>
          ) : (
            <CallPanel hideBots={hideBots} />
          )}
        </TabsContent>
        <TabsContent value="voicemail" className="flex-1 min-h-0 m-0">
          <VoicemailPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
