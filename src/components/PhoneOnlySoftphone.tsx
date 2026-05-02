import { useCallback, useEffect, useMemo, useState } from "react";
import { Delete, Mic, MicOff, Phone, PhoneCall, PhoneIncoming, PhoneOff, RefreshCw, Wifi, WifiOff } from "lucide-react";

import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SoftphoneStatus } from "@/hooks/useSoftphone";
import { formatPhoneInput, toE164 } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type PhoneOnlySoftphoneProps = {
  initialNumber?: string;
  contactName?: string;
  jobId?: string;
  customerId?: string;
};

const keys = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
];

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function statusCopy(status: SoftphoneStatus) {
  switch (status) {
    case "ready":
      return { label: "Ready", icon: Wifi, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
    case "registering":
      return { label: "Connecting", icon: RefreshCw, className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" };
    case "connecting":
      return { label: "Calling", icon: PhoneCall, className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" };
    case "ringing":
      return { label: "Ringing", icon: PhoneCall, className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" };
    case "on-call":
      return { label: "On call", icon: PhoneCall, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
    case "error":
      return { label: "Needs attention", icon: WifiOff, className: "border-destructive/30 bg-destructive/10 text-destructive" };
    default:
      return { label: "Offline", icon: WifiOff, className: "border-border bg-muted text-muted-foreground" };
  }
}

export function PhoneOnlySoftphone({ initialNumber, contactName, jobId, customerId }: PhoneOnlySoftphoneProps) {
  const {
    status,
    error,
    callDuration,
    callerInfo,
    pendingDialNumber,
    incomingCall,
    isMuted,
    initialize,
    dial,
    hangUp,
    acceptCall,
    rejectCall,
    toggleMute,
    sendDigit,
    consumeDialNumber,
  } = useSoftphoneContext();

  const [number, setNumber] = useState(() => formatPhoneInput(initialNumber));
  const [localError, setLocalError] = useState<string | null>(null);
  const isIncomingCall = status === "ringing" && !!incomingCall;
  const activeCall = status === "connecting" || status === "ringing" || status === "on-call";
  const validDialNumber = useMemo(() => toE164(number), [number]);
  const canDial = Boolean(validDialNumber) && !activeCall && status !== "registering";
  const displayNumber = activeCall ? formatPhoneInput(callerInfo?.number || number) : number;
  const statusInfo = statusCopy(status);
  const StatusIcon = statusInfo.icon;

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (initialNumber) setNumber(formatPhoneInput(initialNumber));
  }, [initialNumber]);

  useEffect(() => {
    if (!pendingDialNumber) return;
    setNumber(formatPhoneInput(pendingDialNumber));
    consumeDialNumber();
  }, [consumeDialNumber, pendingDialNumber]);

  const appendDigit = useCallback((digit: string) => {
    if (activeCall) {
      sendDigit(digit);
      return;
    }
    setLocalError(null);
    setNumber((current) => formatPhoneInput(`${current}${digit}`));
  }, [activeCall, sendDigit]);

  const removeDigit = useCallback(() => {
    if (activeCall) return;
    setLocalError(null);
    setNumber((current) => formatPhoneInput(current.replace(/\D/g, "").slice(0, -1)));
  }, [activeCall]);

  const handleCall = useCallback(() => {
    if (!validDialNumber) {
      setLocalError("Enter the full 10-digit phone number first.");
      return;
    }
    if (!canDial) return;
    setLocalError(null);
    void dial(validDialNumber, contactName, jobId, customerId);
  }, [canDial, contactName, customerId, dial, jobId, validDialNumber]);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-[420px] flex-col px-5 py-4">
        <header className="mb-4 flex items-start justify-between gap-3 pr-7">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-lg font-semibold leading-tight">Softphone</h1>
                <p className="text-sm text-muted-foreground">{contactName || "Outbound phone"}</p>
              </div>
            </div>
          </div>
          <Badge variant="outline" className={cn("h-8 gap-1.5 rounded-md px-2.5 text-xs font-semibold", statusInfo.className)}>
            <StatusIcon className={cn("h-3.5 w-3.5", status === "registering" && "animate-spin")} />
            {statusInfo.label}
          </Badge>
        </header>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isIncomingCall ? "Incoming call" : activeCall ? "Current call" : "Dial number"}
            </span>
            {status === "on-call" && (
              <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {formatDuration(callDuration)}
              </span>
            )}
          </div>

          <Input
            value={displayNumber}
            onChange={(event) => {
              setLocalError(null);
              setNumber(formatPhoneInput(event.target.value));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCall();
            }}
            disabled={activeCall}
            placeholder="Enter phone number"
            inputMode="tel"
            className="h-14 rounded-md border-border bg-muted/45 text-center text-2xl font-semibold tracking-normal text-foreground placeholder:text-muted-foreground/45"
          />

          {callerInfo?.name && activeCall && (
            <p className="mt-2 text-center text-sm font-medium text-muted-foreground">{callerInfo.name}</p>
          )}
        </section>

        <section className="mt-4 grid grid-cols-3 gap-2">
          {keys.map((key) => (
            <button
              key={key.digit}
              type="button"
              onClick={() => appendDigit(key.digit)}
              className="flex h-[52px] flex-col items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm transition hover:border-primary/40 hover:bg-muted/40 active:scale-[0.99]"
            >
              <span className="text-xl font-semibold leading-none">{key.digit}</span>
              <span className="mt-1 h-3 text-[10px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                {key.letters}
              </span>
            </button>
          ))}
        </section>

        {isIncomingCall ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={acceptCall}
              className="h-12 rounded-md bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
            >
              <PhoneIncoming className="mr-2 h-4 w-4" />
              Answer
            </Button>
            <Button
              type="button"
              onClick={rejectCall}
              className="h-12 rounded-md bg-red-600 text-base font-semibold text-white hover:bg-red-700"
            >
              <PhoneOff className="mr-2 h-4 w-4" />
              Decline
            </Button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-[1fr_72px] gap-2">
            {activeCall ? (
              <Button
                type="button"
                onClick={hangUp}
                className="h-12 rounded-md bg-red-600 text-base font-semibold text-white hover:bg-red-700"
              >
                <PhoneOff className="mr-2 h-4 w-4" />
                Hang up
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleCall}
                disabled={!canDial}
                className="h-12 rounded-md bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700 disabled:bg-muted disabled:text-muted-foreground"
              >
                <PhoneCall className="mr-2 h-4 w-4" />
                Call
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={removeDigit}
              disabled={activeCall || !number}
              className="h-12 rounded-md border-border bg-card"
              aria-label="Backspace"
            >
              <Delete className="h-5 w-5" />
            </Button>
          </div>
        )}

        {status === "on-call" && (
          <Button
            type="button"
            variant="outline"
            onClick={toggleMute}
            className="mt-2 h-11 w-full rounded-md border-border bg-card text-sm font-semibold"
          >
            {isMuted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
            {isMuted ? "Unmute" : "Mute"}
          </Button>
        )}

        {(localError || error) && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {localError || error}
          </div>
        )}

        <div className="mt-auto" />
      </div>
    </div>
  );
}
