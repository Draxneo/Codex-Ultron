import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Phone, Wifi, WifiOff } from "lucide-react";
import { SoftphoneStrip } from "@/components/SoftphoneStrip";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { Badge } from "@/components/ui/badge";
import { createPhoneConsoleChannel, type PhoneConsoleMessage } from "@/lib/phoneConsoleBridge";

export default function PhoneConsole() {
  const softphone = useSoftphoneContext();
  const {
    error,
    initialize,
    setDialNumber,
    status,
  } = softphone;
  const [searchParams] = useSearchParams();
  const bootDialNumber = searchParams.get("dial") || "";
  const channelRef = useRef<BroadcastChannel | null>(null);
  const pendingDialRef = useRef<string | null>(bootDialNumber || null);

  const statusLabel = useMemo(() => {
    if (status === "on-call") return "On call";
    if (status === "ringing") return "Ringing";
    if (status === "connecting") return "Connecting";
    if (status === "ready") return "Ready";
    if (status === "registering") return "Registering";
    if (status === "error") return "Error";
    return "Offline";
  }, [status]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const channel = createPhoneConsoleChannel();
    channelRef.current = channel;
    if (!channel) return;

    channel.onmessage = (event) => {
      const message = event.data as PhoneConsoleMessage;
      if (message?.type === "dial" && message.number) {
        pendingDialRef.current = message.number;
        setDialNumber(message.number);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [setDialNumber]);

  useEffect(() => {
    channelRef.current?.postMessage({
      type: "status",
      status,
      error,
    } satisfies PhoneConsoleMessage);
  }, [status, error]);

  useEffect(() => {
    if (bootDialNumber) {
      setDialNumber(bootDialNumber);
    }
  }, [bootDialNumber, setDialNumber]);

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Phone className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold">Phone Console</h1>
              <p className="text-xs text-muted-foreground">Outbound webphone</p>
            </div>
          </div>
          <Badge variant={status === "ready" || status === "on-call" ? "default" : "secondary"} className="gap-1">
            {status === "offline" || status === "error" ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
            {statusLabel}
          </Badge>
        </div>
      </header>
      <main className="min-h-0 flex-1 flex">
        <SoftphoneStrip alwaysExpanded />
      </main>
    </div>
  );
}
