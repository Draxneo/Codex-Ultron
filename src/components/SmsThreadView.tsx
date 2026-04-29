import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, ArrowDownLeft, ArrowUpRight, User, Wrench, LinkIcon, ArrowLeft, ChevronUp, CheckCheck, Clock, AlertCircle, Mail, MapPin, ExternalLink, Building2, Paperclip, X, FileText, File as FileIcon, CalendarDays, Search } from "lucide-react";
import { toast } from "sonner";
import { SmsForwardButton } from "@/components/sms/SmsForwardButton";
import { InspectTwilioSmsButton } from "@/components/inbox/InspectTwilioSmsButton";
import { MmsMediaRenderer } from "@/components/chat/MmsMediaRenderer";
import { getFileCategory } from "@/lib/fileTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { SmsTemplatePicker } from "@/components/SmsTemplatePicker";
import { ClickToCall } from "@/components/ClickToCall";
import { formatDateTimeUS, formatPhone, formatPhoneInput, toE164 } from "@/lib/formatters";
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { useComposerIntelligence } from "@/hooks/useComposerIntelligence";
import { GrammarPreview } from "@/components/ui/GrammarPreview";
import { DictateButton } from "@/components/voice/DictateButton";
import { insertAtSelection } from "@/lib/insertAtCursor";
import { DayDivider } from "@/components/shared/DayDivider";
import { ctTimeLabel, groupByDay } from "@/lib/dateGrouping";
import { SMS_CONVERSATION_STATUS_LABELS, type SmsConversation, type SmsConversationStatus } from "@/hooks/useSmsLog";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";
import { normalizeMediaAttachments } from "@/lib/mediaAttachments";
import { openDispatchWorkspace } from "@/lib/dispatchWorkspace";
import { AskJarvisButton } from "@/components/jarvis/AskJarvisButton";

const INITIAL_MSG_COUNT = 10;
const LOAD_MORE_COUNT = 20;
const INLINE_PHONE_REGEX = /(\+?1?[\s.-]*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4})/g;

interface Props {
  conversation: SmsConversation | null;
  sending: boolean;
  onSend: (to: string, body: string, jobId?: string, contactName?: string, mediaUrls?: string[]) => Promise<boolean>;
  onMarkRead: (phone: string) => void;
  onStatusChange?: (phone: string, status: SmsConversationStatus) => void;
  onBack?: () => void;
  newMessageMode?: boolean;
  prefillPhone?: string;
  prefillBody?: string | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

function DeliveryIcon({ status }: { status?: string | null }) {
  if (!status) return null;
  switch (status) {
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-green-500" />;
    case "sent":
    case "queued":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "failed":
    case "undelivered":
      return <AlertCircle className="h-3 w-3 text-destructive" />;
    default:
      return null;
  }
}

export function SmsThreadView({ conversation, sending, onSend, onMarkRead, onStatusChange, onBack, newMessageMode, prefillPhone, prefillBody, hasMore, loadingMore, onLoadMore }: Props) {
  const callerLookup = useCallerLookup(conversation?.phoneNumber);
  const telephony = useTelephonyMode();
  const [body, setBody] = useState(prefillBody || "");
  const [newTo, setNewTo] = useState(prefillPhone ? formatPhoneInput(prefillPhone) : "");
  const [visibleCount, setVisibleCount] = useState(INITIAL_MSG_COUNT);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sendInFlightRef = useRef(false);

  // Re-apply draft if it changes (e.g., user navigates from another todo)
  useEffect(() => {
    if (prefillBody) setBody(prefillBody);
  }, [prefillBody]);
  const prevConvoPhone = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview?: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // Mark as read
  useEffect(() => {
    if (conversation && conversation.unreadCount > 0) {
      onMarkRead(conversation.phoneNumber);
    }
  }, [conversation, onMarkRead]);

  // Slice messages to only show visibleCount from the end
  const allMessages = conversation?.messages ?? [];
  const totalCount = allMessages.length;
  const startIdx = Math.max(0, totalCount - visibleCount);
  const visibleMessages = allMessages.slice(startIdx);
  const hasOlderLocal = startIdx > 0;
  const isUnknownCustomer = !!conversation && conversation.contactType === "unknown" && !callerLookup.data?.id;
  const scheduledDate = conversation?.jobContext?.scheduledDate || conversation?.estimateContext?.scheduledDate || null;
  const schedulePath = scheduledDate ? `/?date=${encodeURIComponent(scheduledDate.slice(0, 10))}` : "/";
  const showScheduleButton = !!conversation && !!(conversation.latestJobId || scheduledDate);
  const headerName = isUnknownCustomer
    ? "Unknown Customer"
    : conversation?.contactName || formatPhone(conversation?.phoneNumber || "") || conversation?.phoneNumber;

  const openWorkspace = (pathOrUrl: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openDispatchWorkspace(pathOrUrl);
  };

  const handleLoadOlder = useCallback(() => {
    const container = scrollContainerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;

    setVisibleCount((prev) => prev + LOAD_MORE_COUNT);

    // Preserve scroll position after DOM updates
    requestAnimationFrame(() => {
      if (container) {
        const newHeight = container.scrollHeight;
        container.scrollTop += newHeight - prevHeight;
      }
    });
  }, []);

  const uploadFiles = async (files: { file: File }[]) => {
    const urls: string[] = [];
    for (const { file } of files) {
      const ext = file.name.split(".").pop() || "bin";
      const path = `outbound/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("mms-media").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("mms-media").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const executeSend = async (text: string): Promise<boolean> => {
    let to = newMessageMode ? newTo.trim() : conversation?.phoneNumber;
    if (newMessageMode && to) {
      const e164 = toE164(to);
      if (!e164) {
        toast.error("Invalid phone number — enter a 10-digit US number (e.g. (210) 555-1234)");
        return false;
      }
      to = e164;
    }
    if (!to || (!text.trim() && pendingFiles.length === 0) || sending || sendInFlightRef.current) return false;
    sendInFlightRef.current = true;

    let mediaUrls: string[] | undefined;
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        mediaUrls = await uploadFiles(pendingFiles);
      } catch (err: any) {
        toast.error("Failed to upload file", { description: err?.message || "Check your connection and try again" });
        setUploading(false);
        sendInFlightRef.current = false;
        return false;
      }
      setUploading(false);
    }

    const success = await onSend(to, text.trim() || "Attachment", conversation?.latestJobId || undefined, conversation?.contactName || undefined, mediaUrls);
    sendInFlightRef.current = false;
    if (success) {
      setBody("");
      setPendingFiles([]);
    }
    return !!success;
  };

  const composer = useComposerIntelligence({
    value: body,
    setValue: setBody,
    context: "sms",
    onSend: executeSend,
  });
  const {
    inputRef: bodyInputRef,
    handleChange: handleBodyChange,
    handleBlur: handleBodyBlur,
    handleSend: smartSend,
    polishing,
    isBusy,
    preview: polishPreview,
    acceptPolish,
    rejectPolish,
    cancelPolish,
  } = composer;

  // Reset visible count when switching conversations
  useEffect(() => {
    if (conversation?.phoneNumber !== prevConvoPhone.current) {
      prevConvoPhone.current = conversation?.phoneNumber ?? null;
      setVisibleCount(INITIAL_MSG_COUNT);
      requestAnimationFrame(() => bodyInputRef.current?.focus?.());
    }
  }, [bodyInputRef, conversation?.phoneNumber]);

  // Wrapper: if user has only attachments (no text), bypass the polish flow.
  const handleSend = async () => {
    if (sending || polishing) return;
    if (!body.trim() && pendingFiles.length > 0) {
      await executeSend("");
      return;
    }
    await smartSend();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const fileItems = items.filter((item) => item.type.startsWith("image/") || item.type === "application/pdf" || item.type.startsWith("video/"));
    if (fileItems.length === 0) return;
    e.preventDefault();
    const newFiles = fileItems
      .map((item) => item.getAsFile())
      .filter(Boolean)
      .map((file) => ({
        file: file!,
        preview: file!.type.startsWith("image/") ? URL.createObjectURL(file!) : undefined,
      }));
    setPendingFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = files.map((f) => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    setPendingFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const renderMessageBody = (raw: string) => {
    const parts = raw.split(INLINE_PHONE_REGEX);
    return parts.map((part, index) => {
      const normalized = toE164(part);
      if (!normalized) return <span key={`${part}-${index}`}>{part}</span>;

      const lookupName = [callerLookup.data?.first_name, callerLookup.data?.last_name].filter(Boolean).join(" ") || callerLookup.data?.company || undefined;

      return (
        <ClickToCall
          key={`${normalized}-${index}`}
          phone={normalized}
          contactName={conversation?.contactName || lookupName}
          customerId={callerLookup.data?.id || undefined}
          className="font-medium underline underline-offset-2"
          iconClassName="hidden"
          showIcon={false}
        >
          {part}
        </ClickToCall>
      );
    });
  };

  if (!conversation && !newMessageMode) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a conversation or start a new message</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 bg-card">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {newMessageMode ? (
          <div className="flex-1">
            <p className="text-sm font-semibold">New Message</p>
          </div>
        ) : conversation && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{headerName}</p>
              <Badge variant={conversation.contactType === "employee" ? "default" : conversation.contactType === "vendor" ? "outline" : "secondary"} className="text-[10px] h-5">
                {conversation.contactType === "employee" ? (
                  <><Wrench className="h-3 w-3 mr-1" /> Tech</>
                ) : conversation.contactType === "customer" ? (
                  <><User className="h-3 w-3 mr-1" /> Customer</>
                ) : conversation.contactType === "vendor" ? (
                  <><Building2 className="h-3 w-3 mr-1" /> Vendor</>
                ) : conversation.contactType === "marketing" ? (
                  <>📣 Marketing</>
                ) : "Unknown"}
              </Badge>
              <Select
                value={conversation.status}
                onValueChange={(value) => onStatusChange?.(conversation.phoneNumber, value as SmsConversationStatus)}
              >
                <SelectTrigger className="h-7 w-[128px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {(Object.keys(SMS_CONVERSATION_STATUS_LABELS) as SmsConversationStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {SMS_CONVERSATION_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <ClickToCall
                phone={conversation.phoneNumber}
                contactName={conversation.contactName || undefined}
                className="text-xs text-muted-foreground hover:text-primary gap-1"
                iconClassName="h-3 w-3"
              >
                {formatPhone(conversation.phoneNumber) || conversation.phoneNumber}
              </ClickToCall>

              {callerLookup.data?.email && (
                <a
                  href={`mailto:${callerLookup.data.email}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
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
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-[200px]">{addr}</span>
                  </a>
                );
              })()}

              {callerLookup.data?.hcp_customer_id && (
                <a
                  href={`https://pro.housecallpro.com/app/customers/${callerLookup.data.hcp_customer_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  title="Open in Housecall Pro"
                >
                  <ExternalLink className="h-3 w-3" /> HCP
                </a>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {callerLookup.data?.id ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={openWorkspace(`/customers/${callerLookup.data.id}`)}
                >
                  <User className="h-3.5 w-3.5" />
                  Customer
                </Button>
              ) : isUnknownCustomer ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={openWorkspace("/customers")}
                >
                  <Search className="h-3.5 w-3.5" />
                  Search Customer
                </Button>
              ) : null}

              {conversation.latestJobId && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={openWorkspace(`/jobs/${conversation.latestJobId}`)}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  {conversation.jobContext?.label || "Job"}
                </Button>
              )}

              {conversation.estimateContext?.id && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={openWorkspace(`/estimates/${conversation.estimateContext.id}`)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {conversation.estimateContext.label}
                </Button>
              )}

              {showScheduleButton && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 gap-1.5 text-xs"
                  onClick={openWorkspace(schedulePath)}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Schedule
                </Button>
              )}

              <AskJarvisButton
                contextType="sms"
                contextId={conversation.phoneNumber}
                label="Ask JARVIS"
                context={{
                  source: "sms_thread",
                  phone: conversation.phoneNumber,
                  customer_id: callerLookup.data?.id || null,
                  customer_name: conversation.contactName || headerName,
                  customer_phone: conversation.phoneNumber,
                  contact_type: conversation.contactType,
                  status: conversation.status,
                  unread_count: conversation.unreadCount,
                  job_id: conversation.latestJobId || null,
                  job_context: conversation.jobContext || null,
                  estimate_context: conversation.estimateContext || null,
                  last_message: conversation.lastMessage?.body || null,
                  last_message_at: conversation.lastMessage?.created_at || null,
                  suggested_actions: [
                    "Summarize this SMS thread",
                    "Identify whether this needs a reply, job update, estimate update, or customer note",
                    "Draft a response for human approval",
                  ],
                }}
                variant="outline"
                className="h-8 gap-1.5 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Messages — flex-col-reverse anchors scroll to bottom like Google Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4"
        style={{ display: "flex", flexDirection: "column-reverse" }}
      >
        <div className="space-y-2 py-3" style={{ display: "flex", flexDirection: "column" }}>
          {/* Load older button at top */}
          {hasOlderLocal && (
            <div className="flex justify-center pb-2">
              <Button variant="ghost" size="sm" onClick={handleLoadOlder} className="text-xs gap-1">
                <ChevronUp className="h-3 w-3" />
                Load older messages ({totalCount - visibleCount} more)
              </Button>
            </div>
          )}
          {/* If all local messages shown but server has more */}
          {!hasOlderLocal && hasMore && onLoadMore && (
            <div className="flex justify-center pb-2">
              <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore} className="text-xs gap-1">
                {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
                Load older messages
              </Button>
            </div>
          )}
          {groupByDay(visibleMessages, (m) => m.created_at, (m) => (m as any).day_ct).map((group) => (
            <div key={group.key}>
              <DayDivider label={group.label} />
              {group.items.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2 mb-2 ${
                    msg.direction === "outbound" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 text-sm overflow-hidden break-words ${
                      msg.direction === "outbound"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      {msg.direction === "inbound" ? (
                        <ArrowDownLeft className="h-3 w-3 opacity-60" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3 opacity-60" />
                      )}
                      <span className="text-[10px] font-medium opacity-60">
                        {msg.direction === "inbound" ? (msg.contact_name || msg.phone_number) : "You"}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words overflow-hidden">{renderMessageBody(msg.body || "")}</p>
                    {normalizeMediaAttachments(msg.media_urls).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {normalizeMediaAttachments(msg.media_urls).map((media, i) => (
                          <MmsMediaRenderer
                            key={`${media.url}-${i}`}
                            url={media.url}
                            contentType={media.fileType || undefined}
                            fileName={media.fileName}
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <p className="text-[10px] opacity-50">
                        {ctTimeLabel(msg.created_at)}
                      </p>
                      {msg.direction === "outbound" && (
                        <DeliveryIcon status={(msg as any).delivery_status} />
                      )}
                      {msg.direction === "outbound" && (msg as any).twilio_sid &&
                        ["failed", "undelivered", "sending"].includes(String((msg as any).delivery_status || "").toLowerCase()) && (
                          <InspectTwilioSmsButton messageSid={(msg as any).twilio_sid} className="h-5 px-1.5 text-[10px]" />
                        )}
                      <SmsForwardButton
                        messageBody={msg.body || ""}
                        senderName={msg.direction === "inbound" ? (msg.contact_name || msg.phone_number) : "You"}
                        mediaUrls={(msg as any).media_urls}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Compose */}
      <div className="border-t bg-card pt-3 pb-8 px-3 space-y-2">
        {polishPreview && (
          <GrammarPreview
            original={polishPreview.original}
            polished={polishPreview.polished}
            onAccept={acceptPolish}
            onReject={rejectPolish}
            onCancel={cancelPolish}
          />
        )}
        {newMessageMode && (
          <Input
            value={newTo}
            onChange={(e) => setNewTo(formatPhoneInput(e.target.value))}
            onPaste={(e) => {
              e.preventDefault();
              const pasted = e.clipboardData.getData("text");
              setNewTo(formatPhoneInput(pasted));
            }}
            placeholder="To: (210) 555-1234"
            inputMode="tel"
            autoComplete="tel"
            className="text-sm"
          />
        )}
        {/* Pending image previews */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((pf, i) => (
              <div key={i} className="relative group">
                {pf.preview ? (
                  <img src={pf.preview} alt="pending" className="h-16 w-16 object-cover rounded border" />
                ) : (
                  <div className="h-16 w-16 rounded border bg-muted flex flex-col items-center justify-center gap-0.5 px-1">
                    {getFileCategory(pf.file.name, pf.file.type) === "pdf" ? (
                      <FileText className="h-5 w-5 text-red-500" />
                    ) : (
                      <FileIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="text-[8px] text-muted-foreground truncate w-full text-center">{pf.file.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removePendingFile(i)}
                  className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.csv,.txt,.xlsx,video/*,application/pdf" multiple className="hidden" onChange={handleFileSelect} />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileInputRef.current?.click()} title="Attach image">
            <Paperclip className="h-4 w-4" />
          </Button>
          <SmsTemplatePicker
            onSelect={(templateBody) => {
              const el = bodyInputRef.current;
              const insertText = body ? ` ${templateBody}` : templateBody;
              const { value, caret } = insertAtSelection(body, el?.selectionStart ?? null, el?.selectionEnd ?? null, insertText);
              setBody(value);
              requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
            }}
          />
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
          <Textarea
            ref={bodyInputRef}
            value={body}
            onChange={handleBodyChange}
            onBlur={handleBodyBlur}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            onPaste={handlePaste}
            placeholder="Type a message... (Shift+Enter for newline)"
            className="min-h-[42px] max-h-28 flex-1 resize-none py-2 text-sm"
            disabled={sending || uploading || polishing}
          />
          <Button
            size="icon"
            onClick={() => void handleSend()}
            disabled={sending || uploading || isBusy || (!body.trim() && pendingFiles.length === 0) || (newMessageMode && !newTo.trim())}
            title={polishing ? "Checking grammar..." : "Send"}
          >
            {sending || uploading || polishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
