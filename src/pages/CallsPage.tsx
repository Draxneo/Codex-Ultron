import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpRight, Delete, Phone, PhoneOff, Voicemail, Bot } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CallPanel } from "@/components/CallPanel";
import { VoicemailPanel } from "@/components/VoicemailPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVoicemails } from "@/hooks/useVoicemails";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { useCallLog, type CallConversation } from "@/hooks/useCallLog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { playDtmfTone } from "@/lib/softphoneAudio";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getCompanySetting } from "@/lib/companySettings";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { formatPhone } from "@/lib/formatters";
import { ctHeaderLabel } from "@/lib/dateGrouping";

const DIAL_KEYS: { key: string; sub?: string }[][] = [
  [{ key: "1", sub: "" }, { key: "2", sub: "ABC" }, { key: "3", sub: "DEF" }],
  [{ key: "4", sub: "GHI" }, { key: "5", sub: "JKL" }, { key: "6", sub: "MNO" }],
  [{ key: "7", sub: "PQRS" }, { key: "8", sub: "TUV" }, { key: "9", sub: "WXYZ" }],
  [{ key: "*" }, { key: "0", sub: "+" }, { key: "#" }],
];

function MobileDialPad() {
  const softphone = useSoftphoneContext();
  const { consumeDialNumber, pendingDialNumber } = softphone;
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialInput, setDialInput] = useState("");

  // Consume pending dial number from ClickToCall
  useEffect(() => {
    if (pendingDialNumber) {
      setDialInput(pendingDialNumber);
      consumeDialNumber();
    }
  }, [consumeDialNumber, pendingDialNumber]);

  useEffect(() => {
    const queryPhone = searchParams.get("phone");
    if (!queryPhone) return;
    setDialInput(queryPhone);
    const queryJobId = searchParams.get("jobId");
    const queryCustomerId = searchParams.get("customerId");
    if (queryJobId) softphone.setPendingJobId(queryJobId);
    if (queryCustomerId) softphone.setPendingCustomerId(queryCustomerId);
    const next = new URLSearchParams(searchParams);
    next.delete("phone");
    next.delete("jobId");
    next.delete("customerId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, softphone]);

  const { data: dialTonesSetting } = useQuery({
    queryKey: ["company_settings", "softphone_dial_tones"],
    queryFn: () => getCompanySetting("softphone_dial_tones", "true"),
  });

  const dialTonesEnabled = dialTonesSetting !== "false";
  const isActive = ["connecting", "ringing", "on-call"].includes(softphone.status);
  const isOnCall = softphone.status === "on-call";

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
    openPhoneConsole(e164);
    setDialInput("");
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Active call display */}
      {isActive && (
        <div className="text-center space-y-3 py-2">
          <div>
            {softphone.callerInfo?.name && (
              <p className="text-lg font-bold text-foreground">{softphone.callerInfo.name}</p>
            )}
            <p className="text-sm text-muted-foreground font-mono">{formatPhone(softphone.callerInfo?.number) || softphone.callerInfo?.number || "Connecting..."}</p>
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

      {softphone.error && (
        <p className="text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2 text-center">{softphone.error}</p>
      )}
    </div>
  );
}

function normalizeName(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function MobileRecentCalls() {
  const { conversations, loading } = useCallLog();
  const { employeeId } = useAuth();
  const [visibleCount, setVisibleCount] = useState(5);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const { data: employeeName } = useQuery({
    queryKey: ["current_employee_name_for_phone", employeeId],
    enabled: Boolean(employeeId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("name")
        .eq("id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return data?.name || null;
    },
  });

  const recentOutbound = useMemo(() => {
    const currentEmployee = normalizeName(employeeName);
    const outbound = conversations
      .map((conversation) => {
        const calls = conversation.calls.filter((call) => call.direction === "outbound");
        if (!calls.length) return null;
        const lastCall = calls[0];
        return { ...conversation, calls, lastCall };
      })
      .filter(Boolean) as CallConversation[];

    const mine = currentEmployee
      ? outbound.filter((conversation) =>
          conversation.calls.some((call) => normalizeName(call.answered_by) === currentEmployee)
        )
      : [];

    const source = mine.length ? mine : outbound;
    return source.sort((a, b) => new Date(b.lastCall.created_at).getTime() - new Date(a.lastCall.created_at).getTime());
  }, [conversations, employeeName]);

  const visibleCalls = recentOutbound.slice(0, visibleCount);
  const canLoadMore = visibleCount < recentOutbound.length;

  useEffect(() => {
    setVisibleCount(5);
  }, [employeeName]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !canLoadMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((current) => Math.min(current + 10, recentOutbound.length));
      }
    }, { rootMargin: "120px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, recentOutbound.length, visibleCount]);

  if (loading) {
    return (
      <section className="border-t px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent calls</p>
        <div className="mt-3 space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-14 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="border-t px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent calls</p>
          <p className="text-[11px] text-muted-foreground">Last five first. Older calls load as you scroll.</p>
        </div>
        {recentOutbound.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            {recentOutbound.length}
          </span>
        )}
      </div>

      {visibleCalls.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          No outbound calls yet.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCalls.map((conversation) => (
            <RecentCallRow key={conversation.phoneNumber} conversation={conversation} />
          ))}
          {canLoadMore && (
            <div ref={loadMoreRef} className="py-2 text-center text-[11px] font-semibold text-muted-foreground">
              Loading older calls...
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RecentCallRow({ conversation }: { conversation: CallConversation }) {
  const phone = conversation.phoneNumber;
  const name = conversation.contactName || formatPhone(phone) || phone;
  const lastCall = conversation.lastCall;

  return (
    <button
      type="button"
      onClick={() => openPhoneConsole(phone)}
      className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left shadow-sm transition hover:bg-muted/40 active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ArrowUpRight className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{formatPhone(phone) || phone}</span>
      </span>
      <span className="text-right text-[11px] text-muted-foreground">
        {ctHeaderLabel(lastCall.created_at)}
      </span>
    </button>
  );
}

export default function CallsPage({ embedded = false, defaultTab = "calls" }: { embedded?: boolean; defaultTab?: string }) {
  const { unreadCount } = useVoicemails();
  const isMobile = useIsMobile();
  const softphone = useSoftphoneContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [hideBots, setHideBots] = useState(true);

  useEffect(() => {
    setActiveTab(tabParam === "voicemail" ? "voicemail" : defaultTab);
  }, [defaultTab, tabParam]);

  if (isMobile) {
    return (
      <div className="h-full bg-background flex flex-col overflow-hidden">
        <div className="shrink-0 border-b bg-card px-4 py-3">
          <h1 className="text-base font-bold">Phone</h1>
          <p className="text-xs text-muted-foreground">Dial out and see your latest customer calls.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <MobileDialPad />
          <MobileRecentCalls />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      {!embedded && !isMobile && <AppHeader />}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          const next = new URLSearchParams(searchParams);
          if (value === "voicemail") next.set("tab", "voicemail");
          else next.delete("tab");
          setSearchParams(next, { replace: true });
        }}
        className="flex-1 flex flex-col min-h-0"
      >
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
          <CallPanel hideBots={hideBots} />
        </TabsContent>
        <TabsContent value="voicemail" className="flex-1 min-h-0 m-0">
          <VoicemailPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
