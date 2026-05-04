/**
 * TechSmsThreadView — Displays SMS thread for a technician in Team HQ.
 *
 * Renders incoming/outbound messages, marks as read, and provides a composer
 * with BU selection. Supports MMS (photo attachments) because dispatchers send
 * pictures to subcontractors all the time — site photos, reference images,
 * equipment specs, etc. File upload, preview, drag-drop, and paste-from-clipboard
 * are all supported. Files are uploaded to Supabase storage on Send.
 *
 * Reuses existing SMS rendering, media upload patterns (SmsThreadView), and
 * send logic. The send-sms edge function already handles MMS via Twilio.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Loader2, Paperclip, X, FileText, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/formatters";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { getSmsThreadKey } from "@/hooks/useSmsLog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MmsMediaRenderer } from "@/components/chat/MmsMediaRenderer";
import { normalizeMediaAttachments } from "@/lib/mediaAttachments";
import { getFileCategory } from "@/lib/fileTypes";

interface SmsMessage {
  id: string;
  phone_number: string;
  direction: "inbound" | "outbound";
  body: string;
  is_read: boolean;
  created_at: string;
  media_urls?: Array<{ url: string; content_type: string }> | null;
}

interface TechSmsThreadViewProps {
  techId: string;
  techPhone: string;
  techName: string;
  businessUnitId: string | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

export function TechSmsThreadView({
  techId,
  techPhone,
  techName,
  businessUnitId,
}: TechSmsThreadViewProps) {
  const { sendSms, markAsRead } = useSmsLogScoped();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview?: string }[]>([]);

  // Fetch SMS messages for this tech's phone (including media attachments).
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["tech-sms-thread-messages", techId, techPhone],
    queryFn: async () => {
      const phoneVariants = [
        `+1${techPhone.replace(/\D/g, "").slice(-10)}`,
        techPhone.replace(/\D/g, "").slice(-10),
        techPhone,
      ];

      const { data, error } = await supabase
        .from("v_sms_log_with_day")
        .select("id, phone_number, direction, body, is_read, created_at, media_urls")
        .in("phone_number", phoneVariants)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as SmsMessage[];
    },
    staleTime: 5_000,
  });

  // Mark inbound messages as read.
  useEffect(() => {
    const threadKey = getSmsThreadKey(techPhone);
    void markAsRead(threadKey);
  }, [techPhone, markAsRead]);

  // Auto-scroll to bottom.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Upload files to Supabase storage (mms-media bucket).
  const uploadFiles = useCallback(async (files: { file: File }[]): Promise<string[]> => {
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
  }, []);

  // Handle file selection from file picker.
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = files.map((f) => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    setPendingFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  // Handle paste from clipboard (images, PDFs, videos).
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const fileItems = items.filter(
      (item) => item.type.startsWith("image/") || item.type === "application/pdf" || item.type.startsWith("video/")
    );
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

  // Handle drag-and-drop on the composer.
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    const newFiles = files.map((f) => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    setPendingFiles((prev) => [...prev, ...newFiles]);
  };

  // Remove a pending file from the preview.
  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!body.trim() && pendingFiles.length === 0) return;

    setSending(true);

    let mediaUrls: string[] | undefined;
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        mediaUrls = await uploadFiles(pendingFiles);
      } catch (err: any) {
        toast.error("Failed to upload file", {
          description: err?.message || "Check your connection and try again",
        });
        setUploading(false);
        setSending(false);
        return;
      }
      setUploading(false);
    }

    try {
      const success = await sendSms(
        techPhone,
        body.trim() || "Attachment",
        undefined,
        techName,
        mediaUrls,
        { businessUnitId: businessUnitId || undefined }
      );
      if (success) {
        setBody("");
        setPendingFiles([]);
      }
    } catch (err) {
      console.error("Failed to send SMS:", err);
      toast.error("Failed to send SMS");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="flex min-h-[200px] items-center justify-center text-center text-muted-foreground">
              <p className="text-sm">
                No messages yet. Start the conversation.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            const mediaAttachments = normalizeMediaAttachments(msg.media_urls || null);
            return (
              <div
                key={msg.id}
                className={cn("flex gap-2", isOutbound && "flex-row-reverse")}
              >
                {!isOutbound && (
                  <Avatar className="h-7 w-7 shrink-0 mt-1">
                    <AvatarFallback className="text-xs">
                      {initials(techName)}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={cn(
                    "max-w-xs rounded-lg px-3 py-2 text-sm",
                    isOutbound
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">{msg.body}</p>
                  {/* Media attachments (MMS) */}
                  {mediaAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {mediaAttachments.map((media, i) => (
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
                  <p
                    className={cn(
                      "mt-1 text-xs opacity-70",
                      isOutbound
                        ? "text-primary-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {formatDistanceToNow(new Date(msg.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>

                {isOutbound && (
                  <div className="mt-1">
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* Composer with MMS support */}
      <footer
        className="border-t bg-card/90 p-3 space-y-2"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* File input (hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.csv,.txt,.xlsx,video/*,application/pdf"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Pending file previews */}
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

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image or file"
              disabled={sending || uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <Textarea
              placeholder="Type a message... (Ctrl+Enter to send, drop files here)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onPaste={handlePaste}
              disabled={sending || uploading}
              className="min-h-20 resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  handleSend();
                }
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBody("")}
              disabled={!body.trim() || sending || uploading}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={(!body.trim() && pendingFiles.length === 0) || sending || uploading}
            >
              {sending || uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploading ? "Uploading" : "Sending"}
                </>
              ) : (
                "Send"
              )}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
