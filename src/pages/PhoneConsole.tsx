import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Phone, Wifi, WifiOff } from "lucide-react";
import { SoftphoneStrip } from "@/components/SoftphoneStrip";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { Badge } from "@/components/ui/badge";
import { createPhoneConsoleChannel, type PhoneConsoleMessage } from "@/lib/phoneConsoleBridge";

export default function PhoneConsole() {
  const softphone = useSoftphoneContext();
  const [searchParams] = useSearchParams();
  const bootDialNumber = searchParams.get("dial") || "";
  const channelRef = useRef<BroadcastChannel | null>(null);
  const pendingDialRef = useRef<string | null>(bootDialNumber || null);

  const statusLabel = useMemo(() => {
    if (softphone.status === "on-call") return "On call";
    if (softphone.status === "ringing") return "Ringing";
    if (softphone.status === "connecting") return "Connecting";
    if (softphone.status === "ready") return "Ready";
    if (softphone.status === "registering") return "Registering";
    if (softphone.status === "error") return "Error";
    return "Offline";
  }, [softphone.status]);

  useEffect(() => {
    void softphone.initialize();
  }, [softphone.initialize]);

  useEffect(() => {
    const channel = createPhoneConsoleChannel();
    channelRef.current = channel;
    if (!channel) return;

    channel.onmessage = (event) => {
      const message = event.data as PhoneConsoleMessage;
      if (message?.type === "dial" && message.number) {
        pendingDialRef.current = message.number;
        softphone.setDialNumber(message.number);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [softphone.setDialNumber]);

  useEffect(() => {
    channelRef.current?.postMessage({
      type: "status",
      status: softphone.status,
      error: softphone.error,
    } satisfies PhoneConsoleMessage);
  }, [softphone.status, softphone.error]);

  useEffect(() => {
    if (bootDialNumber) {
      softphone.setDialNumber(bootDialNumber);
    }
  }, [bootDialNumber, softphone.setDialNumber]);

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
          <Badge variant={softphone.status === "ready" || softphone.status === "on-call" ? "default" : "secondary"} className="gap-1">
            {softphone.status === "offline" || softphone.status === "error" ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
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
