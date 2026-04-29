import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Loader2, ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronUp,
  User, Wrench, HelpCircle, Building2, LinkIcon, Mail, MapPin, ExternalLink,
  CheckCheck, Clock, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { ClickToCall } from "@/components/ClickToCall";
import { Link } from "react-router-dom";
import { formatDateTimeUS, formatPhone } from "@/lib/formatters";
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { useComposerIntelligence } from "@/hooks/useComposerIntelligence";
import { GrammarPreview } from "@/components/ui/GrammarPreview";
import { DictateButton } from "@/components/voice/DictateButton";
import { insertAtSelection } from "@/lib/insertAtCursor";
import { cn } from "@/lib/utils";
import { DayDivider } from "@/components/shared/DayDivider";
import { ctHeaderLabel, ctTimeLabel, groupByDay } from "@/lib/dateGrouping";
import type { SmsConversation } from "@/hooks/useSmsLog";

const INITIAL_MSG_COUNT = 10;
const LOAD_MORE_COUNT = 20;

interface Props {
  conversation: SmsConversation;
  isExpanded: boolean;
  onToggle: () => void;
  sending: boolean;
  onSend: (to: string, body: string, jobId?: string) => Promise<boolean>;
  onMarkRead: (phone: string) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

function DeliveryIcon({ status }: { status?: string | null }) {
  if (!status) return null;
  switch (status) {
    case "delivered": return <CheckCheck className="h-3 w-3 text-[hsl(var(--success))]" />;
    case "sent":
    case "queued": return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "failed":
    case "undelivered": return <AlertCircle className="h-3 w-3 text-destructive" />;
    default: return null;
  }
}

export function SmsContactCard({ conversation, isExpanded, onToggle, sending, onSend, onMarkRead, hasMore, loadingMore, onLoadMore }: Props) {
  const { phoneNumber, contactName, contactType, lastMessage, unreadCount, messages, latestJobId } = conversation;
  const callerLookup = useCallerLookup(isExpanded ? phoneNumber : null);

  const [body, setBody] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_MSG_COUNT);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const composer = useComposerIntelligence({
    value: body,
    setValue: setBody,
    context: "sms",
    onSend: async (text) => {
      const ok = await onSend(phoneNumber, text, latestJobId || undefined);
      if (ok) setBody("");
      return ok;
    },
  });
  const { inputRef: bodyInputRef, handleChange: handleBodyChange, handleBlur: handleBodyBlur, handleSend, polishing, isBusy, preview: polishPreview, acceptPolish, rejectPolish, cancelPolish } = composer;

  const Icon = contactType === "employee" ? Wrench : contactType === "customer" ? User : contactType === "vendor" ? Building2 : HelpCircle;

  // Reset visible count when card expands
  useEffect(() => {
    if (isExpanded) {
      setVisibleCount(INITIAL_MSG_COUNT);
    }
  }, [isExpanded]);

  // Mark as read when expanding
  useEffect(() => {
    if (isExpanded && unreadCount > 0) {
      onMarkRead(phoneNumber);
    }
  }, [isExpanded, onMarkRead, phoneNumber, unreadCount]);

  const totalCount = messages.length;
  const startIdx = Math.max(0, totalCount - visibleCount);
  const visibleMessages = messages.slice(startIdx);
  const hasOlderLocal = startIdx > 0;

  const handleLoadOlder = useCallback(() => {
    const container = scrollContainerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    setVisibleCount((prev) => prev + LOAD_MORE_COUNT);
    requestAnimationFrame(() => {
      if (container) {
        const newHeight = container.scrollHeight;
        container.scrollTop += newHeight - prevHeight;
      }
    });
  }, []);

  const handleToggle = () => {
    onToggle();
  };

  return (
    <div className={cn("rounded-xl border transition-shadow", isExpanded && "shadow-md ring-1 ring-accent/20")}>
      {/* Collapsed header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded-xl"
      >
        <div className={cn(
          "shrink-0 h-10 w-10 rounded-full flex items-center justify-center",
          contactType === "employee" ? "bg-primary/10 text-primary" : contactType === "vendor" ? "bg-orange-500/10 text-orange-600" : "bg-accent/10 text-accent-foreground"
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{contactName || formatPhone(phoneNumber) || phoneNumber}</span>
            {unreadCount > 0 && (
              <span className="h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1.5">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {lastMessage.direction === "outbound" ? "You: " : ""}
            {lastMessage.body.slice(0, 60)}
          </p>
          {contactName && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatPhone(phoneNumber) || phoneNumber}</p>}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {ctHeaderLabel(lastMessage.created_at)}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t flex flex-col">
          {/* Contact info bar */}
          <div className="flex items-center gap-2 px-4 py-2 flex-wrap border-b bg-muted/20">
            <ClickToCall
              phone={phoneNumber}
              contactName={contactName || undefined}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              iconClassName="h-3 w-3"
            >
              Call
            </ClickToCall>

            {callerLookup.data?.email && (
              <a
                href={`mailto:${callerLookup.data.email}`}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Mail className="h-3 w-3" /> Email
              </a>
            )}

            {callerLookup.data?.address && (() => {
              const addr = [callerLookup.data.address, callerLookup.data.city, callerLookup.data.state, callerLookup.data.zip].filter(Boolean).join(", ");
              return (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapPin className="h-3 w-3" /> Map
                </a>
              );
            })()}

            {callerLookup.data?.id && (
              <Link
                to={`/customers/${callerLookup.data.id}`}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" /> Profile
              </Link>
            )}

            {latestJobId && (
              <Link
                to={`/jobs/${latestJobId}`}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <LinkIcon className="h-3 w-3" /> Job
              </Link>
            )}

            {callerLookup.data?.hcp_customer_id && (
              <a
                href={`https://pro.housecallpro.com/app/customers/${callerLookup.data.hcp_customer_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
                title="Open in Housecall Pro"
              >
                <ExternalLink className="h-3 w-3" /> HCP
              </a>
            )}
          </div>

          {/* Message thread — capped height with internal scroll */}
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto px-3 max-h-[400px]"
            style={{ display: "flex", flexDirection: "column-reverse" }}
          >
            <div className="space-y-2 py-3" style={{ display: "flex", flexDirection: "column" }}>
              {hasOlderLocal && (
                <div className="flex justify-center pb-2">
                  <Button variant="ghost" size="sm" onClick={handleLoadOlder} className="text-xs gap-1">
                    <ChevronUp className="h-3 w-3" />
                    Load older ({totalCount - visibleCount} more)
                  </Button>
                </div>
              )}
              {!hasOlderLocal && hasMore && onLoadMore && (
                <div className="flex justify-center pb-2">
                  <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore} className="text-xs gap-1">
                    {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
                    Load older
                  </Button>
                </div>
              )}
              {groupByDay(visibleMessages, (m) => m.created_at, (m) => (m as any).day_ct).map((group) => (
                <div key={group.key}>
                  <DayDivider label={group.label} />
                  {group.items.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 mb-2 ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg p-2.5 text-sm",
                          msg.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                        )}
                      >
                        <p className="whitespace-pre-wrap text-xs">{msg.body}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <p className="text-[10px] opacity-50">{ctTimeLabel(msg.created_at)}</p>
                          {msg.direction === "outbound" && <DeliveryIcon status={(msg as any).delivery_status} />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Compose bar */}
          <div className="border-t bg-card px-3 py-2 space-y-2">
            {polishPreview && (
              <GrammarPreview
                original={polishPreview.original}
                polished={polishPreview.polished}
                onAccept={acceptPolish}
                onReject={rejectPolish}
                onCancel={cancelPolish}
              />
            )}
            <div className="flex items-center gap-1">
              <EmojiPicker onSelect={(emoji) => setBody((prev) => prev + emoji)} />
              <DictateButton
                size="sm"
                showLabel
                hideOnMobile={false}
                autoStopOnSilence={false}
                provider="openai"
                title="Dictate message"
                onTranscript={(text) => {
                  const el = bodyInputRef.current;
                  const { value, caret } = insertAtSelection(body, el?.selectionStart ?? null, el?.selectionEnd ?? null, text);
                  setBody(value);
                  requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
                }}
              />
              <Input
                ref={bodyInputRef}
                value={body}
                onChange={handleBodyChange}
                onBlur={handleBodyBlur}
                onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter" && !e.shiftKey) handleSend(); }}
                placeholder="Type a message..."
                className="flex-1 h-8 text-xs"
                disabled={sending || polishing}
                onClick={(e) => e.stopPropagation()}
              />
              <Button
                size="icon"
                className="h-8 w-8"
                onClick={handleSend}
                disabled={sending || isBusy || !body.trim()}
                title={polishing ? "Checking grammar..." : "Send"}
              >
                {sending || polishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
