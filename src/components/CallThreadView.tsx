import { useState } from "react";
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, PhoneOff, ChevronDown, Mail, MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ClickToCall } from "@/components/ClickToCall";
import { Link } from "react-router-dom";
import { getRecordingProxyUrl } from "@/lib/recordingProxy";
import { cn } from "@/lib/utils";
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { AnsweredByBadge } from "@/components/AnsweredByBadge";
import { InspectTwilioButton } from "@/components/inbox/InspectTwilioButton";
import { DayDivider } from "@/components/shared/DayDivider";
import { ctTimeLabel, groupByDay } from "@/lib/dateGrouping";
import { UniversalMediaPlayer } from "@/components/media";
import { formatPhone } from "@/lib/formatters";
import type { CallConversation } from "@/hooks/useCallLog";

interface Props {
  conversation: CallConversation | null;
  onBack: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function RecordingPlayButton({ recordingUrl }: { recordingUrl: string }) {
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

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed": return "default";
    case "in-progress":
    case "ringing": return "secondary";
    case "no-answer":
    case "busy":
    case "failed":
    case "canceled": return "destructive";
    default: return "outline";
  }
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function CallThreadView({ conversation, onBack }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const callerLookup = useCallerLookup(conversation?.phoneNumber);

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a contact to view call history
      </div>
    );
  }

  const { calls, contactName, phoneNumber } = conversation;
  const prettyPhone = formatPhone(phoneNumber) || phoneNumber;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-card shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7 md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{contactName || prettyPhone}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <ClickToCall
              phone={phoneNumber}
              contactName={contactName || undefined}
              className="text-xs text-muted-foreground hover:text-primary gap-1"
              iconClassName="h-3 w-3"
            >
              {prettyPhone}
            </ClickToCall>

            {callerLookup.data?.email && (
              <a
                href={`mailto:${callerLookup.data.email}`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="h-3 w-3 shrink-0" />
                {callerLookup.data.email}
              </a>
            )}

            {callerLookup.data?.address && (() => {
              const addr = [callerLookup.data.address, callerLookup.data.city, callerLookup.data.state, callerLookup.data.zip].filter(Boolean).join(", ");
              return (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[200px]">{addr}</span>
                </a>
              );
            })()}

            {callerLookup.data?.id && (
              <Link
                to={`/customers/${callerLookup.data.id}`}
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Profile
              </Link>
            )}

            {callerLookup.data?.hcp_customer_id && (
              <a
                href={`https://pro.housecallpro.com/app/customers/${callerLookup.data.hcp_customer_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                title="Open in Housecall Pro"
              >
                <ExternalLink className="h-3 w-3" /> HCP
              </a>
            )}
          </div>
        </div>
        <ClickToCall
          phone={phoneNumber}
          contactName={contactName || undefined}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
          iconClassName="h-3.5 w-3.5"
        >
          Call
        </ClickToCall>
      </div>

      {/* Call list — grouped by CT day */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-4">
          {groupByDay(calls, (c) => c.created_at, (c) => (c as any).day_ct).map((group) => (
            <div key={group.key} className="space-y-1">
              <DayDivider label={group.label} />
              {group.items.map((call) => {
                const isInbound = call.direction === "inbound";
                const isExpanded = expandedId === call.id;
                const hasDetails = call.recording_url || call.transcription || call.ai_summary;

                return (
                  <div key={call.id} className="rounded-lg border overflow-hidden">
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 text-sm group",
                        hasDetails && "cursor-pointer hover:bg-muted/50 transition-colors"
                      )}
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : call.id)}
                    >
                      <div className="shrink-0">
                        {call.status === "completed" ? (
                          isInbound ? <PhoneIncoming className="h-4 w-4 text-primary" /> : <PhoneOutgoing className="h-4 w-4 text-accent-foreground" />
                        ) : (
                          <PhoneOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {ctTimeLabel(call.created_at)}
                          {call.duration_seconds ? ` · ${formatDuration(call.duration_seconds)}` : ""}
                        </p>
                        {!isExpanded && call.ai_summary && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 italic">
                            {call.ai_summary}
                          </p>
                        )}
                      </div>
                      {call.recording_url && !isExpanded && (
                        <RecordingPlayButton recordingUrl={call.recording_url} />
                      )}
                      <ClickToCall
                        phone={call.phone_number}
                        contactName={call.contact_name || undefined}
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                        iconClassName="h-3.5 w-3.5"
                        showIcon={true}
                      >
                        {""}
                      </ClickToCall>
                      <AnsweredByBadge direction={call.direction} status={call.status} extractedData={(call as any).extracted_data} />
                      <Badge variant={statusVariant(call.status)} className="text-[10px] shrink-0">
                        {call.status}
                      </Badge>
                      {hasDetails && (
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
                      )}
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 border-t bg-muted/30 space-y-3">
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
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
                            <p className="text-xs text-foreground leading-relaxed">{call.ai_summary}</p>
                          </div>
                        )}
                        {call.transcription && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Transcription</p>
                            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{call.transcription}</p>
                          </div>
                        )}
                        {!call.recording_url && !call.ai_summary && !call.transcription && (
                          <p className="text-xs text-muted-foreground italic">No recording or transcription available</p>
                        )}
                        {(call as any).twilio_sid && ((call as any).extracted_data?.overflow_to || !call.recording_url) && (
                          <div className="pt-1">
                            <InspectTwilioButton
                              callSid={(call as any).twilio_sid}
                              callLogId={call.id}
                              hasRecording={!!call.recording_url}
                              className="h-7 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
