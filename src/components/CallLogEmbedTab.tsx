import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, PhoneIncoming, PhoneOutgoing, PhoneOff, Phone, ExternalLink, Brain, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClickToCall } from "@/components/ClickToCall";
import { cn } from "@/lib/utils";
import { formatPhone, normalizeLast10 } from "@/lib/formatters";
import { groupByDay, ctTimeLabel } from "@/lib/dateGrouping";
import { DayDivider } from "@/components/shared/DayDivider";
import { getRecordingProxyUrl } from "@/lib/recordingProxy";
import { UniversalMediaPlayer } from "@/components/media";
import { errorMessage } from "@/lib/errorMessage";

type CallRow = {
  id: string;
  direction: "inbound" | "outbound";
  phone_number: string;
  duration_seconds: number | null;
  status: string;
  contact_name: string | null;
  recording_url: string | null;
  created_at: string;
  transcription: string | null;
  ai_summary: string | null;
  extracted_data: Record<string, any> | null;
};

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

/** Read-only call log for a customer (matched by customer ID, fallback to phone) */
export function CustomerCallsTab({ phones, customerId }: { phones: string[]; customerId?: string }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const normalizedPhones = useMemo(() => phones.map(normalizeLast10).filter(Boolean), [phones]);

  useEffect(() => {
    const fetchCalls = async () => {
      // Try direct customer ID lookup first
      if (customerId) {
      const { data, error } = await supabase
          .from("call_log")
          .select("id, direction, phone_number, duration_seconds, status, contact_name, recording_url, created_at, transcription, ai_summary, extracted_data")
          .eq("related_customer_id", customerId)
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          setLoadError(null);
          setCalls(data as CallRow[]);
          setLoading(false);
          return;
        }
        if (error) {
          setLoadError(errorMessage(error));
        }
      }

      // Fallback: phone number matching
      if (normalizedPhones.length === 0) { setCalls([]); setLoading(false); return; }

      const { data, error } = await supabase
        .from("call_log")
        .select("id, direction, phone_number, duration_seconds, status, contact_name, recording_url, created_at, transcription, ai_summary, extracted_data")
        .order("created_at", { ascending: false });

      if (error) {
        setLoadError(errorMessage(error));
        setCalls([]);
      } else {
        setLoadError(null);
        const filtered = (data || []).filter((row: any) =>
          normalizedPhones.includes(normalizeLast10(row.phone_number))
        );
        setCalls(filtered as CallRow[]);
      }
      setLoading(false);
    };

    fetchCalls();
  }, [normalizedPhones, customerId]);

  if (loading) return <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;
  if (loadError) return <EmbedLoadError title="Call history did not load" detail={`${loadError} Refresh before relying on this customer's call history.`} />;
  if (!calls.length) return <p className="text-center text-muted-foreground py-8">No call records on file</p>;

  return <CallList calls={calls} />;
}

/** Read-only call log for a job (matched by related_job_id) */
export function JobCallsTab({ jobId }: { jobId: string }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCalls = async () => {
      const { data, error } = await supabase
        .from("call_log")
        .select("id, direction, phone_number, duration_seconds, status, contact_name, recording_url, created_at, transcription, ai_summary, extracted_data")
        .eq("related_job_id", jobId)
        .order("created_at", { ascending: false });

      if (error) {
        setLoadError(errorMessage(error));
        setCalls([]);
      } else {
        setLoadError(null);
        setCalls((data || []) as CallRow[]);
      }
      setLoading(false);
    };

    fetchCalls();
  }, [jobId]);

  if (loading) return <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;
  if (loadError) return <EmbedLoadError title="Job calls did not load" detail={`${loadError} Refresh before relying on this job's call history.`} />;
  if (!calls.length) return <p className="text-center text-muted-foreground py-8">No calls linked to this job</p>;

  return <CallList calls={calls} />;
}

function CallList({ calls }: { calls: CallRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groups = groupByDay(calls, (c) => c.created_at);
  return (
    <div className="space-y-3 p-4">
        {groups.map((group) => (
          <div key={group.key} className="space-y-1">
            <DayDivider label={group.label} />
            {group.items.map((call) => {
              const isInbound = call.direction === "inbound";
              const isExpanded = expandedId === call.id;
              const hasDetails = call.recording_url || call.transcription || call.ai_summary;

              return (
                <div key={call.id} className="rounded-lg border text-sm group">
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5",
                      hasDetails && "cursor-pointer hover:bg-muted/50"
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
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {call.contact_name || formatPhone(call.phone_number) || call.phone_number}
                        </p>
                        {call.ai_summary && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5 shrink-0">
                            <Brain className="h-2.5 w-2.5" /> Summary
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ctTimeLabel(call.created_at)}
                        {call.duration_seconds ? ` - ${formatDuration(call.duration_seconds)}` : ""}
                      </p>
                    </div>
                    <ClickToCall
                      phone={call.phone_number}
                      contactName={call.contact_name || undefined}
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                      iconClassName="h-3.5 w-3.5"
                      showIcon={true}
                    >
                      {""}
                    </ClickToCall>
                    {call.recording_url && !isExpanded && (
                      <UniversalMediaPlayer
                        src={getRecordingProxyUrl(call.recording_url)}
                        kind="audio"
                        variant="compact"
                        stopPropagation
                      />
                    )}
                    <Badge variant={statusVariant(call.status)} className="text-[10px] shrink-0">
                      {call.status}
                    </Badge>
                    {hasDetails && (
                      <div className="shrink-0">
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t pt-2">
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
                        <div className="bg-muted/50 rounded-md p-2.5">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Brain className="h-3 w-3" /> AI Summary
                          </p>
                          <p className="text-xs text-foreground whitespace-pre-wrap">{call.ai_summary}</p>
                        </div>
                      )}
                      {call.transcription && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            Transcript
                          </p>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{call.transcription}</p>
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
  );
}

function EmbedLoadError({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="m-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}
