import { useState, useEffect } from "react";
import {
  PhoneIncoming, PhoneOutgoing, PhoneOff,
  ChevronDown, Mail, MapPin, ExternalLink, Wrench, HelpCircle,
  ShieldCheck, ShieldAlert, ShieldX, MessageSquare, Bot, Voicemail,
  ArrowDownLeft, ArrowUpRight, X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ClickToCall } from "@/components/ClickToCall";
import { Link, useNavigate } from "react-router-dom";
import { getRecordingProxyUrl } from "@/lib/recordingProxy";
import { cn } from "@/lib/utils";
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { supabase } from "@/integrations/supabase/client";
import { AnsweredByBadge } from "@/components/AnsweredByBadge";
import { InspectTwilioButton } from "@/components/inbox/InspectTwilioButton";
import { DayDivider } from "@/components/shared/DayDivider";
import { ctHeaderLabel, ctTimeLabel, groupByDay } from "@/lib/dateGrouping";
import { formatPhone } from "@/lib/formatters";
import { SmsButton } from "@/components/SmsButton";
import { UniversalMediaPlayer } from "@/components/media";
import type { CallConversation, CallRow } from "@/hooks/useCallLog";
import { AskJarvisButton } from "@/components/jarvis/AskJarvisButton";

interface Props {
  conversation: CallConversation;
  isExpanded: boolean;
  onToggle: () => void;
  onMarkRead: (phone: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed": return "default";
    case "in-progress":
    case "ringing": return "secondary";
    case "no-answer":
    case "busy":
    case "failed":
    case "canceled":
    case "suspected-bot": return "destructive";
    default: return "outline";
  }
}

function statusLabel(status: string): string {
  if (status === "suspected-bot") return "🤖 Bot";
  return status;
}

function StirBadge({ status }: { status: string }) {
  if (status === "A" || status === "B") {
    return <span title={`Verified (${status})`}><ShieldCheck className="h-3 w-3 text-[hsl(var(--success))]" /></span>;
  }
  if (status === "C" || status === "none" || status === "unknown") {
    return <span title={`Unverified (${status})`}><ShieldAlert className="h-3 w-3 text-[hsl(var(--warning,40_100%_50%))]" /></span>;
  }
  if (status === "failed") {
    return <span title="Spam blocked"><ShieldX className="h-3 w-3 text-destructive" /></span>;
  }
  return null;
}

function RecordingPlayer({ recordingUrl }: { recordingUrl: string }) {
  return (
    <UniversalMediaPlayer
      src={getRecordingProxyUrl(recordingUrl)}
      kind="audio"
      variant="compact"
      stopPropagation
      className="h-7 w-7"
    />
  );
}

function CallDetailRow({ call }: { call: CallRow }) {
  const [showDetails, setShowDetails] = useState(false);
  const isInbound = call.direction === "inbound";
  const hasDetails = call.recording_url || call.transcription || call.ai_summary;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm",
          hasDetails && "cursor-pointer hover:bg-muted/50 transition-colors"
        )}
        onClick={() => hasDetails && setShowDetails(!showDetails)}
      >
        <div className="shrink-0">
          {call.status === "completed" ? (
            isInbound ? <PhoneIncoming className="h-3.5 w-3.5 text-primary" /> : <PhoneOutgoing className="h-3.5 w-3.5 text-accent-foreground" />
          ) : (
            <PhoneOff className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {ctTimeLabel(call.created_at)}
            {call.duration_seconds ? ` · ${formatDuration(call.duration_seconds)}` : ""}
          </p>
          {!showDetails && call.ai_summary && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 italic">{call.ai_summary}</p>
          )}
        </div>
        {call.recording_url && !showDetails && <RecordingPlayer recordingUrl={call.recording_url} />}
        <AnsweredByBadge direction={call.direction} status={call.status} extractedData={call.extracted_data} />
        {(call as any).twilio_sid && ((call as any).extracted_data?.overflow_to || !call.recording_url) && (
          <InspectTwilioButton
            callSid={(call as any).twilio_sid}
            callLogId={call.id}
            hasRecording={!!call.recording_url}
            className="h-6 px-2 text-[10px] shrink-0"
          />
        )}
        <Badge variant={statusVariant(call.status)} className="text-[10px] shrink-0">{statusLabel(call.status)}</Badge>
        {hasDetails && (
          <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform shrink-0", showDetails && "rotate-180")} />
        )}
      </div>

      {showDetails && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/30 space-y-2">
          {call.recording_url && (
            <UniversalMediaPlayer
              src={getRecordingProxyUrl(call.recording_url)}
              kind="audio"
              title="Call recording"
              subtitle={call.duration_seconds ? formatDuration(call.duration_seconds) : undefined}
              variant="inline"
              stopPropagation
            />
          )}
          {call.ai_summary && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Summary</p>
              <p className="text-xs text-foreground leading-relaxed">{call.ai_summary}</p>
            </div>
          )}
          {call.transcription && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Transcription</p>
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{call.transcription}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CallContactCard({ conversation, isExpanded, onToggle, onMarkRead }: Props) {
  const { calls, contactName, phoneNumber, contactType, lastCall, unreadCount } = conversation;
  // Resolve name from CRM when the call_log record has no contact_name
  const needsLookup = !contactName && contactType !== "employee";
  const callerLookup = useCallerLookup(needsLookup || isExpanded ? phoneNumber : null);
  const navigate = useNavigate();

  // Resolved display name: prefer DB record, fall back to CRM lookup
  const resolvedName = contactName || (callerLookup.data ? [callerLookup.data.first_name, callerLookup.data.last_name].filter(Boolean).join(" ") : null);
  const resolvedType = contactType !== "unknown" ? contactType : (callerLookup.data ? "customer" : contactType);

  // Write back resolved name to call_log so it persists
  useEffect(() => {
    if (resolvedName && !contactName && callerLookup.data) {
      const ids = calls.filter(c => !c.contact_name).map(c => c.id);
      if (ids.length > 0) {
        supabase.from("call_log").update({
          contact_name: resolvedName,
          contact_type: "customer",
          related_customer_id: callerLookup.data.id,
        } as any).in("id", ids).then(() => {});
      }
    }
  }, [calls, resolvedName, contactName, callerLookup.data]);

  // Initials fallback when we have a name
  const initials = resolvedName
    ? resolvedName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
    : null;

  // Direction icon — colored arrow/state
  const renderDirectionIcon = () => {
    if (lastCall.status === "suspected-bot") {
      return <Bot className="h-3.5 w-3.5 text-muted-foreground" aria-label="Suspected bot" />;
    }
    if (["no-answer", "busy", "failed", "canceled", "missed-while-busy", "unknown"].includes(lastCall.status)) {
      return <XIcon className="h-3.5 w-3.5 text-destructive" aria-label="Missed" />;
    }
    if (lastCall.status === "completed") {
      return lastCall.direction === "inbound"
        ? <ArrowDownLeft className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-label="Answered inbound" />
        : <ArrowUpRight className="h-3.5 w-3.5 text-primary" aria-label="Outbound" />;
    }
    return <PhoneOff className="h-3.5 w-3.5 text-muted-foreground" aria-label={lastCall.status} />;
  };

  const directionLabel = lastCall.status === "suspected-bot"
    ? "Bot"
    : lastCall.status === "completed"
      ? (lastCall.direction === "inbound" ? "Answered" : "Outbound")
      : lastCall.status === "no-answer" ? "Missed"
      : lastCall.status;

  // "Ghost" row detection: a call with no duration, no recording, no answered_by —
  // most likely an un-reconciled stub from the call-waiting/overflow path.
  const isGhost =
    !lastCall.duration_seconds &&
    !lastCall.recording_url &&
    !(lastCall.extracted_data as any)?.answered_by &&
    ["no-answer", "unknown", "missed-while-busy"].includes(lastCall.status);

  const handleToggle = () => {
    if (!isExpanded && unreadCount > 0) onMarkRead(phoneNumber);
    onToggle();
  };

  // Display phone (formatted). If the "name" IS just the phone, don't show it twice.
  const prettyPhone = formatPhone(phoneNumber) || phoneNumber;
  const nameIsPhone = !resolvedName || resolvedName.replace(/\D/g, "") === phoneNumber.replace(/\D/g, "");
  const displayName = resolvedName || prettyPhone;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 transition-all duration-150",
        isExpanded && "shadow-md ring-1 ring-accent/20 border-border",
      )}
    >
      {/* Collapsed header — always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors duration-150 rounded-xl"
      >
        {/* Avatar: initials for named contacts, wrench for employees, question for unknown */}
        <div className={cn(
          "shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold",
          resolvedType === "employee"
            ? "bg-primary/10 text-primary"
            : initials
              ? "bg-accent/15 text-accent-foreground"
              : "bg-muted text-muted-foreground",
        )}>
          {resolvedType === "employee" ? (
            <Wrench className="h-5 w-5" />
          ) : initials ? (
            <span className="tracking-wide">{initials}</span>
          ) : (
            <HelpCircle className="h-5 w-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Primary row: name · timestamp — unread */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate text-foreground">{displayName}</span>
            <span className="text-muted-foreground/40 shrink-0" aria-hidden>·</span>
            <span
              className="text-xs text-muted-foreground shrink-0 whitespace-nowrap"
              title={format(new Date(lastCall.created_at), "PPpp")}
            >
              {isGhost
                ? format(new Date(lastCall.created_at), "MMM d")
                : ctHeaderLabel(lastCall.created_at)}
            </span>
            {isGhost && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-normal text-muted-foreground border-dashed">
                unconfirmed
              </Badge>
            )}
            {unreadCount > 0 && (
              <span className="ml-auto shrink-0 h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1.5">
                {unreadCount}
              </span>
            )}
          </div>

          {/* Secondary row: direction icon, duration, status chips */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1" title={directionLabel}>
              {renderDirectionIcon()}
              <span className="sr-only">{directionLabel}</span>
            </span>
            {lastCall.duration_seconds ? (
              <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80 tabular-nums">
                {formatDuration(lastCall.duration_seconds)}
              </span>
            ) : null}
            {lastCall.direction === "inbound" && lastCall.stir_status && <StirBadge status={lastCall.stir_status} />}
            <AnsweredByBadge direction={lastCall.direction} status={lastCall.status} extractedData={lastCall.extracted_data} />
          </div>

          {/* Tertiary row: phone — skip when name IS the phone */}
          {!nameIsPhone && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 tabular-nums">{prettyPhone}</p>
          )}
        </div>

        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0 ml-1", isExpanded && "rotate-180")} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <ClickToCall
              phone={phoneNumber}
              contactName={resolvedName || undefined}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              iconClassName="h-3.5 w-3.5"
            >
              Call
            </ClickToCall>

            <SmsButton
              phone={phoneNumber}
              className="inline-flex h-auto w-auto items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              iconClassName="h-3.5 w-3.5"
            />

            {callerLookup.data?.email && (
              <a
                href={`mailto:${callerLookup.data.email}`}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                Email
              </a>
            )}

            {callerLookup.data?.address && (() => {
              const addr = [callerLookup.data.address, callerLookup.data.city, callerLookup.data.state, callerLookup.data.zip].filter(Boolean).join(", ");
              return (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Map
                </a>
              );
            })()}

            {callerLookup.data?.id && (
              <Link
                to={`/customers/${callerLookup.data.id}`}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Profile
              </Link>
            )}

            <AskJarvisButton
              contextType="phone"
              contextId={phoneNumber}
              label="Ask JARVIS"
              context={{
                source: "call_history",
                phone: phoneNumber,
                customer_id: callerLookup.data?.id || null,
                customer_name: resolvedName || displayName,
                customer_phone: phoneNumber,
                contact_type: resolvedType,
                last_call_status: lastCall.status,
                last_call_direction: lastCall.direction,
                last_call_at: lastCall.created_at,
                call_count: calls.length,
                latest_summary: lastCall.ai_summary || null,
                latest_transcription: lastCall.transcription || null,
                suggested_actions: [
                  "Summarize this call history",
                  "Identify whether this should update a job, estimate, or customer note",
                  "Suggest the next follow-up for human approval",
                ],
              }}
              variant="outline"
              className="h-auto px-3 py-1.5 text-xs"
            />
          </div>

          {/* Call history list — grouped by CT day */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {calls.length} call{calls.length !== 1 ? "s" : ""}
            </p>
            {groupByDay(calls, (c) => c.created_at, (c) => (c as any).day_ct).map((group) => (
              <div key={group.key} className="space-y-1.5">
                <DayDivider label={group.label} />
                {group.items.map((call) => (
                  <CallDetailRow key={call.id} call={call} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
