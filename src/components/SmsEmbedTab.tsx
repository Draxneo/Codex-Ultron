import { useMemo, useState, useEffect, useCallback } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Phone, ExternalLink } from "lucide-react";
import { MmsMediaRenderer } from "@/components/chat/MmsMediaRenderer";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "react-router-dom";
import { formatDateTimeUS, normalizeLast10 } from "@/lib/formatters";
import { normalizeMediaAttachments } from "@/lib/mediaAttachments";
import { errorMessage } from "@/lib/errorMessage";

type SmsMediaItem = { url: string; content_type: string };

type SmsRow = {
  id: string;
  direction: "inbound" | "outbound";
  phone_number: string;
  body: string;
  contact_name: string | null;
  created_at: string;
  media_urls?: SmsMediaItem[] | null;
  related_job_id?: string | null;
};

/** Read-only SMS thread for a customer (matched by phone) */
export function CustomerSmsTab({ phones }: { phones: string[] }) {
  const [messages, setMessages] = useState<SmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const normalized = useMemo(() => phones.map(normalizeLast10).filter(Boolean), [phones]);
  const normalizedKey = normalized.join("_");

  const fetchSms = useCallback(async () => {
    if (normalized.length === 0) { setLoadError(null); setLoading(false); return; }
    const { data, error } = await supabase
      .from("sms_log")
      .select("id, direction, phone_number, body, contact_name, created_at, media_urls")
      .order("created_at", { ascending: true });

    if (error) {
      setLoadError(errorMessage(error));
      setMessages([]);
    } else {
      setLoadError(null);
      const filtered = (data || []).filter((row: any) =>
        normalized.includes(normalizeLast10(row.phone_number))
      );
      setMessages(filtered as SmsRow[]);
    }
    setLoading(false);
  }, [normalized]);

  useEffect(() => { fetchSms(); }, [fetchSms]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (normalized.length === 0) return;
    const channel = supabase
      .channel("sms_embed_customer_" + normalizedKey)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sms_log" }, (payload) => {
        const msg = payload.new as SmsRow;
        if (normalized.includes(normalizeLast10(msg.phone_number))) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [normalized, normalizedKey]);

  // Refetch on tab visibility change
  useEffect(() => {
    const handleVis = () => { if (document.visibilityState === "visible") fetchSms(); };
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, [fetchSms]);

  if (loading) return <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;
  if (loadError) return <EmbedLoadError title="SMS did not load" detail={`${loadError} Refresh before relying on this customer's text history.`} />;
  if (!messages.length) return (
    <p className="text-center text-muted-foreground py-8">No SMS messages on record</p>
  );

  return <SmsMessageList messages={messages} />;
}

/** Read-only SMS thread for a job (matched by related_job_id) */
export function JobSmsTab({ jobId }: { jobId: string }) {
  const [messages, setMessages] = useState<SmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchSms = useCallback(async () => {
    const { data, error } = await supabase
      .from("sms_log")
      .select("id, direction, phone_number, body, contact_name, created_at, media_urls")
      .eq("related_job_id", jobId)
      .order("created_at", { ascending: true });

    if (error) {
      setLoadError(errorMessage(error));
      setMessages([]);
    } else {
      setLoadError(null);
      setMessages((data || []) as SmsRow[]);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchSms(); }, [fetchSms]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("sms_embed_job_" + jobId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sms_log" }, (payload) => {
        const msg = payload.new as SmsRow;
        if (msg.related_job_id === jobId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  // Refetch on tab visibility change
  useEffect(() => {
    const handleVis = () => { if (document.visibilityState === "visible") fetchSms(); };
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, [fetchSms]);

  if (loading) return <div className="space-y-2 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;
  if (loadError) return <EmbedLoadError title="Job texts did not load" detail={`${loadError} Refresh before relying on this job's text history.`} />;
  if (!messages.length) return (
    <p className="text-center text-muted-foreground py-8">No SMS messages linked to this job</p>
  );

  return <SmsMessageList messages={messages} />;
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

function SmsMessageList({ messages }: { messages: SmsRow[] }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end px-4 py-2">
        <Link to="/sms" className="text-xs text-primary flex items-center gap-1 hover:underline">
          Open SMS <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-1 px-4 pb-4">
          {messages.map((msg) => {
            const isInbound = msg.direction === "inbound";
            return (
              <div
                key={msg.id}
                className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    isInbound
                      ? "bg-muted text-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {isInbound ? (
                      <ArrowDownLeft className="h-3 w-3 opacity-60" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3 opacity-60" />
                    )}
                    <span className="text-[10px] opacity-70">
                      {formatDateTimeUS(msg.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{msg.body}</p>
                  {normalizeMediaAttachments(msg.media_urls).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {normalizeMediaAttachments(msg.media_urls).map((media, i) => (
                        <MmsMediaRenderer
                          key={`${media.url}-${i}`}
                          url={media.url}
                          contentType={media.fileType || undefined}
                          fileName={media.fileName}
                          compact
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
