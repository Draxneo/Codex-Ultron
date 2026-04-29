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
    acceptCall,
    callDuration,
    callerInfo,
    error,
    hangUp,
    initialize,
    isMuted,
    rejectCall,
    sendDigit,
    dial,
    setDialNumber,
    setPendingCustomerId,
    setPendingJobId,
    status,
    toggleMute,
  } = softphone;
  const [searchParams] = useSearchParams();
  const bootDialNumber = searchParams.get("dial") || "";
  const bootContactName = searchParams.get("name") || undefined;
  const bootJobId = searchParams.get("jobId") || undefined;
  const bootCustomerId = searchParams.get("customerId") || undefined;
  const bootAutoDial = searchParams.get("autoDial") === "1";
  const channelRef = useRef<BroadcastChannel | null>(null);
  const pendingDialRef = useRef<string | null>(bootDialNumber || null);
  const pendingContactNameRef = useRef<string | undefined>(bootContactName);
  const pendingJobIdRef = useRef<string | undefined>(bootJobId);
  const pendingCustomerIdRef = useRef<string | undefined>(bootCustomerId);
  const pendingAutoDialRef = useRef(bootAutoDial);
  const autoDialStartedRef = useRef(false);

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
        pendingContactNameRef.current = message.contactName;
        pendingJobIdRef.current = message.jobId;
        pendingCustomerIdRef.current = message.customerId;
        pendingAutoDialRef.current = message.autoDial !== false;
        autoDialStartedRef.current = false;
        if (message.jobId) setPendingJobId(message.jobId);
        if (message.customerId) setPendingCustomerId(message.customerId);
        setDialNumber(message.number);
      } else if (message?.type === "command") {
        if (message.command === "accept") acceptCall();
        if (message.command === "reject") rejectCall();
        if (message.command === "hangUp") hangUp();
        if (message.command === "toggleMute") toggleMute();
        if (message.command === "sendDigit" && message.digit) sendDigit(message.digit);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [acceptCall, hangUp, rejectCall, sendDigit, setDialNumber, setPendingCustomerId, setPendingJobId, toggleMute]);

  useEffect(() => {
    channelRef.current?.postMessage({
      type: "status",
      status,
      error,
      callerInfo,
      callDuration,
      isMuted,
    } satisfies PhoneConsoleMessage);
  }, [status, error, callerInfo, callDuration, isMuted]);

  useEffect(() => {
    if (bootJobId) setPendingJobId(bootJobId);
    if (bootCustomerId) setPendingCustomerId(bootCustomerId);
    if (bootDialNumber) {
      setDialNumber(bootDialNumber);
    }
  }, [bootCustomerId, bootDialNumber, bootJobId, setDialNumber, setPendingCustomerId, setPendingJobId]);

  useEffect(() => {
    const number = pendingDialRef.current;
    if (!number || !pendingAutoDialRef.current || autoDialStartedRef.current) return;
    if (status === "connecting" || status === "ringing" || status === "on-call") return;

    autoDialStartedRef.current = true;
    void dial(number, pendingContactNameRef.current, pendingJobIdRef.current, pendingCustomerIdRef.current);
  }, [dial, status]);

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
              <p className="text-xs text-muted-foreground">
                {bootContactName ? `Outbound to ${bootContactName}` : "Outbound webphone"}
              </p>
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
