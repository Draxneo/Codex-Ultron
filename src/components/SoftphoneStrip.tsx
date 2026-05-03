import { useMemo, useState, useEffect, useRef } from "react";
import { useLiveTranscript } from "@/hooks/useLiveTranscript";
import { toast } from "@/hooks/use-toast";
import {
  Phone, PhoneOff, PhoneIncoming, PhoneCall,
  Mic, MicOff, Keyboard, Delete, Wifi, WifiOff, User, ChevronDown, ChevronUp,
  ExternalLink, Volume2, Bluetooth, MessageSquareText, BellRing, ArrowRight, Hash,
} from "lucide-react";
import { isElectron, isElectronMain, sendToMain } from "@/lib/electron";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSoftphoneContext } from "./SoftphoneProvider";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { playDtmfTone } from "@/lib/softphoneAudio";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCompanySetting } from "@/lib/companySettings";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/formatters";

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

type TeamNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_entity_id: string | null;
  created_at: string;
};

type TeamMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
};

type TeamConversationRow = {
  id: string;
  name: string | null;
  type: "direct" | "room";
};

type EmployeeLite = {
  profile_id: string | null;
  name: string;
};

function timeAgo(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 0) return "now";
  const minutes = Math.max(1, Math.floor(delta / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function TeamDispatchTextPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["side-rail-team-notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_notifications" as any)
        .select("id, type, title, body, related_entity_id, created_at")
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data || []) as TeamNotificationRow[];
    },
    refetchInterval: 15000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["side-rail-team-messages"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_messages" as any)
        .select("id, conversation_id, sender_id, body, created_at, deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data || []) as TeamMessageRow[];
    },
    refetchInterval: 15000,
  });

  const conversationIds = useMemo(
    () => Array.from(new Set(messages.map((message) => message.conversation_id).filter(Boolean))),
    [messages]
  );
  const senderIds = useMemo(
    () => Array.from(new Set(messages.map((message) => message.sender_id).filter(Boolean))),
    [messages]
  );

  const { data: conversations = [] } = useQuery({
    queryKey: ["side-rail-team-conversations", conversationIds.join(",")],
    enabled: conversationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_conversations" as any)
        .select("id, name, type")
        .in("id", conversationIds);
      if (error) throw error;
      return (data || []) as TeamConversationRow[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["side-rail-team-message-senders", senderIds.join(",")],
    enabled: senderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("profile_id, name")
        .in("profile_id", senderIds);
      if (error) throw error;
      return (data || []) as EmployeeLite[];
    },
  });

  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("team_notifications" as any)
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      toast({ title: "Team alerts stayed unread", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["side-rail-team-notifications", user.id] });
    queryClient.invalidateQueries({ queryKey: ["team-notifications", user.id] });
    queryClient.invalidateQueries({ queryKey: ["now-team-notifications", user.id] });
    queryClient.invalidateQueries({ queryKey: ["intake-team-notifications", user.id] });
    toast({ title: "Team alerts cleared" });
  };

  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const employeeByProfile = new Map(employees.map((employee) => [employee.profile_id, employee.name]));
  const unreadCount = notifications.length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              <MessageSquareText className="h-3.5 w-3.5" />
              Employee Texts
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Team messages surface here so dispatch sees them without hunting.
            </p>
          </div>
          {unreadCount > 0 && (
            <Badge className="border border-[#ff3333]/40 bg-[#ff3333]/15 text-[#ffb3b3]">
              {unreadCount} new
            </Badge>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Now alerts</span>
              <button type="button" onClick={markAllRead} className="text-[10px] font-medium text-[#ffb84d] hover:text-[#ffd08a]">
                Mark read
              </button>
            </div>
            {notifications.slice(0, 3).map((notification) => (
              <a
                key={notification.id}
                href="/team"
                className="block rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-left transition-colors hover:bg-accent/15"
              >
                <div className="flex items-center gap-2">
                  <BellRing className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{notification.title}</p>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(notification.created_at)}</span>
                </div>
                {notification.body && (
                  <p className="mt-1 line-clamp-2 pl-5 text-[11px] text-muted-foreground">{notification.body}</p>
                )}
              </a>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Latest from team</span>
            <a href="/team" className="flex items-center gap-1 text-[10px] font-medium text-[#ffb84d] hover:text-[#ffd08a]">
              Open <ArrowRight className="h-3 w-3" />
            </a>
          </div>

          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#262933] px-3 py-5 text-center">
              <p className="text-xs font-medium text-foreground">No team texts yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground">New employee messages will appear here.</p>
            </div>
          ) : (
            messages.slice(0, 5).map((message) => {
              const sender = employeeByProfile.get(message.sender_id) || (message.sender_id === user?.id ? "You" : "Team member");
              const conversation = conversationById.get(message.conversation_id);
              return (
                <a
                  key={message.id}
                  href={`/team?conversation=${message.conversation_id}`}
                  className="block rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-accent/40 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{sender}</p>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(message.created_at)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Hash className="h-3 w-3" />
                    <span className="truncate">{conversation?.name || (conversation?.type === "direct" ? "Direct message" : "Team")}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                    {message.body || "Attachment"}
                  </p>
                </a>
              );
            })
          )}
        </div>
      </div>

      <Button
        type="button"
        onClick={() => openPhoneConsole()}
        className="h-11 w-full gap-2 rounded-xl bg-[#ff9f00] text-[#0d0e12] hover:bg-[#ffb12b]"
      >
        <Wifi className="h-4 w-4" />
        Open Phone Console
      </Button>
    </div>
  );
}

interface SoftphoneStripProps {
  onCallContextChange?: (ctx: string | null) => void;
  /** When true, hide the collapsible header and keep the dialer permanently expanded. Used for the Electron pop-out window. */
  alwaysExpanded?: boolean;
}

export function SoftphoneStrip({ onCallContextChange, alwaysExpanded = false }: SoftphoneStripProps) {
  const softphone = useSoftphoneContext();
  const {
    activeCall,
    callDuration,
    callerInfo,
    consumeDialNumber,
    dial,
    incomingCall,
    pendingDialNumber,
    sendDigit,
    status,
  } = softphone;
  const { startCallSession, sendQuery } = useCopilotPanel();
  const [expanded, setExpanded] = useState(alwaysExpanded);
  const [dialInput, setDialInput] = useState("");
  const [showDialpad, setShowDialpad] = useState(false);

  const telephony = useTelephonyMode();
  const ownsWebphone = typeof window !== "undefined"
    && (window.location.pathname === "/phone-console" || new URLSearchParams(window.location.search).get("view") === "softphone");
  const showTeamMessagesPanel = !ownsWebphone && !alwaysExpanded && !isElectronMain();

  // Consume pending dial number from ClickToCall
  useEffect(() => {
    if (pendingDialNumber) {
      setDialInput(pendingDialNumber);
      setExpanded(true);
      consumeDialNumber();
    }
  }, [consumeDialNumber, pendingDialNumber]);

  const { data: dialTonesSetting } = useQuery({
    queryKey: ["company_settings", "softphone_dial_tones"],
    queryFn: () => getCompanySetting("softphone_dial_tones", "true"),
  });
  const dialTonesEnabled = dialTonesSetting !== "false";
  const isActive = ["connecting", "ringing", "on-call"].includes(status);
  const hasIncoming = status === "ringing" && !!incomingCall;
  const isOnCall = status === "on-call";
  const isConnecting = status === "connecting";
  const isReady = status === "ready" || status === "registering";

  const { liveTranscript, transcriptEndRef, liveTranscriptionEnabled } = useLiveTranscript(activeCall, isOnCall);

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
    if (!hasIncoming || !incomingCall) return;

    const callSid = (incomingCall as any)?.parameters?.CallSid || "";
    const callKey = callSid || callerInfo?.number || "unknown";

    // Only fire once per unique incoming call
    if (screenPoppedCallRef.current === callKey) return;
    screenPoppedCallRef.current = callKey;

    const phone = callerInfo?.number || "";
    const contactName = callerInfo?.name;

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
  }, [callerInfo, hasIncoming, incomingCall, startCallSession, telephony]);

  // ── Track caller info while on call so we can use it after hang-up ──
  useEffect(() => {
    if (isOnCall && callerInfo?.number) {
      lastCallInfoRef.current = {
        phone: callerInfo.number,
        name: callerInfo.name,
      };
    }
  }, [callerInfo, isOnCall]);

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
              ? `${row.contact_name} (${formatPhone(row.phone_number) || row.phone_number})`
              : formatPhone(row.phone_number) || row.phone_number;
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
    if (isOnCall && callerInfo) {
      const name = callerInfo.name || "Unknown";
      const twilioSid = (activeCall as any)?.parameters?.CallSid || "";
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
      onCallContextChange?.(`Currently on a phone call with ${name} (${callerInfo.number}). Duration: ${formatDuration(callDuration)}.${sidCtx}${transcriptCtx}`);
    } else if (!isActive) {
      onCallContextChange?.(null);
    }
  }, [activeCall, callDuration, callerInfo, isOnCall, isActive, onCallContextChange, liveTranscript]);

  const handleDial = () => {
    if (!dialInput.trim()) return;
    const digits = dialInput.replace(/\D/g, "");
    const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : `+${digits}`;
    // Trigger Copilot customer lookup before dialing
    const resolvedName = callerInfo?.name;
    startCallSession(dialInput, resolvedName);
    if (!ownsWebphone) {
      openPhoneConsole(e164);
      setDialInput("");
      return;
    }
    dial(e164);
    setDialInput("");
  };

  const handleDigitPress = (digit: string) => {
    if (dialTonesEnabled) playDtmfTone(digit);
    if (isActive && activeCall) {
      sendDigit(digit);
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
                  {softphone.callerInfo?.name || formatPhone(softphone.callerInfo?.number) || softphone.callerInfo?.number || "On Call"}
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
              <p className="text-xs text-muted-foreground font-mono">{formatPhone(softphone.callerInfo?.number) || softphone.callerInfo?.number}</p>
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
              <p className="text-xs text-muted-foreground font-mono">{formatPhone(softphone.callerInfo?.number) || softphone.callerInfo?.number || "Connecting..."}</p>
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

        {/* Team text monitor replaces the old embedded dialer in the main app. */}
        {showTeamMessagesPanel && !isActive && !hasIncoming && (
          <TeamDispatchTextPanel />
        )}

        {/* Dial pad */}
        {(!showTeamMessagesPanel || isActive) && (!isActive || showDialpad) && (
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
            onClick={() => {
              if (ownsWebphone) softphone.initialize();
              else openPhoneConsole(dialInput.trim() || undefined);
            }}
            className="w-full h-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-[hsl(var(--warm))] transition-colors active:scale-[0.98]"
          >
            <Wifi className="h-3.5 w-3.5" />
            {ownsWebphone ? (softphone.status === "error" ? "Reconnect Softphone" : "Connect Softphone") : "Open Phone Console"}
          </button>
        )}

        {softphone.error && (
          <p className="text-[10px] text-destructive bg-destructive/5 rounded-md px-2 py-1.5 truncate">{softphone.error}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
