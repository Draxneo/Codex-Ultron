/**
 * TechAttachmentsCard.tsx - field photo/upload + multi-select sharing.
 *
 * Scope: tech media workflow only. Uploads still use the existing
 * job-photos storage bucket, job_attachments table, and classifier function.
 */

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileUp,
  ImagePlus,
  Loader2,
  Send,
  Share2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MediaThumbnail, formatBytes, getFileCategory } from "@/components/media";
import { supabase } from "@/integrations/supabase/client";
import { useJobAttachments } from "@/hooks/useJobAttachments";
import { cn } from "@/lib/utils";

const DISPATCH_LINE = "+12106005091";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const CAMERA_ACCEPT = "image/*";
const UPLOAD_ACCEPT = "image/*,video/*,application/pdf";

interface TechAttachmentsCardProps {
  jobId: string;
  hcpId?: string | null;
  customerPhone?: string | null;
  jobNumber?: string | null;
  techName?: string | null;
  bare?: boolean;
}

export function TechAttachmentsCard({
  jobId,
  hcpId,
  customerPhone,
  jobNumber,
  techName,
  bare = false,
}: TechAttachmentsCardProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: attachments = [], isLoading } = useJobAttachments(hcpId || undefined, jobId);

  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<"customer" | "dispatch" | null>(null);
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);

  const visible = attachments.filter((attachment: any) => !attachment.hidden_from_tech_share);
  const attachmentCount = visible.length;

  const toggleSelect = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const getAttachmentUrl = (attachment: any) => {
    if (attachment.url) return attachment.url;
    const path = attachment.file_path || attachment.path;
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return supabase.storage.from("job-photos").getPublicUrl(path).data.publicUrl;
  };

  const isSupportedUpload = (file: File) => {
    const category = getFileCategory(file.name, file.type);
    return category === "image" || category === "gif" || category === "video" || category === "pdf";
  };

  const refreshAttachments = async () => {
    if (hcpId) await (supabase as any).from("job_attachment_cache").delete().eq("hcp_id", hcpId);
    queryClient.invalidateQueries({ queryKey: ["job-attachments", hcpId || null, jobId] });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setLastUploadError(null);

    let uploadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let supplyInvoiceDetected = false;
    const uploadedIds: string[] = [];

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          skippedCount += 1;
          setLastUploadError(
            `${file.name} is too large (${formatBytes(file.size)}). Keep field uploads under ${formatBytes(MAX_UPLOAD_BYTES)}.`
          );
          continue;
        }

        if (!isSupportedUpload(file)) {
          skippedCount += 1;
          setLastUploadError(`${file.name} is not supported here. Use photos, videos, or PDFs.`);
          continue;
        }

        const ext = file.name.split(".").pop() || "jpg";
        const path = `${jobId}/${crypto.randomUUID()}.${ext}`;
        const fileType = file.type || "application/octet-stream";

        const { error: uploadError } = await supabase.storage
          .from("job-photos")
          .upload(path, file, { contentType: fileType });

        if (uploadError) {
          failedCount += 1;
          setLastUploadError(`${file.name} failed to upload: ${uploadError.message}`);
          continue;
        }

        const { data: row, error: insertError } = await (supabase as any)
          .from("job_attachments")
          .insert({
            job_id: jobId,
            file_name: file.name,
            file_path: path,
            file_type: fileType,
          })
          .select("id")
          .single();

        if (insertError || !row?.id) {
          failedCount += 1;
          setLastUploadError(
            `${file.name} uploaded but could not be attached to the job: ${insertError?.message || "unknown error"}`
          );
          continue;
        }

        const category = getFileCategory(file.name, fileType);
        let hiddenFromCustomerShare = false;
        if (category === "image" || category === "gif") {
          const { data: publicUrl } = supabase.storage.from("job-photos").getPublicUrl(path);
          try {
            const { data: classifyResult } = await supabase.functions.invoke("classify-attachment", {
              body: { attachment_id: row.id, image_url: publicUrl.publicUrl },
            });
            hiddenFromCustomerShare = Boolean((classifyResult as any)?.hidden);
            if (hiddenFromCustomerShare) supplyInvoiceDetected = true;
          } catch (error) {
            console.warn("classify-attachment failed (non-fatal)", error);
          }
        }
        if (!hiddenFromCustomerShare) uploadedIds.push(row.id);

        uploadedCount += 1;
      }

      if (supplyInvoiceDetected) {
        toast.success("Pickup ticket saved to job", {
          description:
            "It was hidden from customer sharing so cost data does not get sent by mistake.",
          duration: 8000,
        });
      } else if (uploadedCount > 0) {
        toast.success(`${uploadedCount} attachment${uploadedCount === 1 ? "" : "s"} uploaded`);
      }
      if (uploadedIds.length > 0) {
        setSelected(new Set(uploadedIds));
      }

      if (failedCount > 0 || skippedCount > 0) {
        const count = failedCount + skippedCount;
        toast.error(`${count} file${count === 1 ? "" : "s"} need attention`);
      }

      await refreshAttachments();
    } catch (error: any) {
      const message = error?.message || "Upload failed. Check the connection and try again.";
      setLastUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const buildShareLinks = async (): Promise<string[]> => {
    const ids = Array.from(selected);
    const rows = visible.filter((attachment: any) => ids.includes(attachment.id));
    const urls: string[] = [];

    for (const attachment of rows as any[]) {
      const path = attachment.file_path || attachment.path;
      if (attachment.url && (attachment.url as string).startsWith("http") && !path) {
        urls.push(attachment.url);
        continue;
      }

      if (!path) continue;

      const { data, error } = await supabase.storage.from("job-photos").createSignedUrl(path, 86400);
      if (!error && data?.signedUrl) urls.push(data.signedUrl);
    }

    if (rows.length > 0 && urls.length !== rows.length) {
      throw new Error("Some selected files could not be prepared for sharing. Try refreshing or select fewer files.");
    }

    return urls;
  };

  const sendMms = async (to: string, body: string, mediaUrls: string[]) => {
    const { sendSmsImpl } = await import("@/hooks/useSendSms");
    const result = await sendSmsImpl({
      to,
      body,
      mediaUrls,
      jobId,
      source: "tech_attachments_share",
      silent: true,
    });
    if (!result.success) throw new Error(result.error || "MMS send failed");
  };

  const handleShareCustomer = async () => {
    if (!customerPhone) {
      toast.error("No customer phone on file");
      return;
    }

    setSharing("customer");
    try {
      const urls = await buildShareLinks();
      if (urls.length === 0) throw new Error("Select at least one shareable attachment first");
      await sendMms(customerPhone, "Photos from your service today:", urls);
      toast.success(`Sent ${urls.length} attachment${urls.length === 1 ? "" : "s"} to customer`);
      clearSelection();
    } catch (error: any) {
      toast.error(error?.message || "Failed to send");
    } finally {
      setSharing(null);
    }
  };

  const handleShareDispatch = async () => {
    setSharing("dispatch");
    try {
      const urls = await buildShareLinks();
      if (urls.length === 0) throw new Error("Select at least one attachment first");
      const prefix = `From ${techName || "tech"} on Job #${jobNumber || jobId.slice(0, 8)}:`;
      await sendMms(DISPATCH_LINE, prefix, urls);
      toast.success(`Sent ${urls.length} attachment${urls.length === 1 ? "" : "s"} to dispatch`);
      clearSelection();
    } catch (error: any) {
      toast.error(error?.message || "Failed to send");
    } finally {
      setSharing(null);
    }
  };

  const body = (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {attachmentCount > 0
            ? `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`
            : "No field photos yet"}
          {selected.size > 0 ? ` - ${selected.size} selected to share` : ""}
        </span>
        <Link to={`/photos/${jobId}`} className="shrink-0 text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>

      {lastUploadError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Attachment needs attention</p>
            <p className="mt-0.5 break-words">{lastUploadError}</p>
          </div>
          <button
            type="button"
            onClick={() => setLastUploadError(null)}
            className="ml-auto text-destructive/70 hover:text-destructive"
            aria-label="Dismiss attachment error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button
          size="lg"
          className="h-16 gap-2 text-base font-bold"
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          Take Photo
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-16 w-20 flex-col gap-1 px-2 text-[11px]"
          onClick={() => uploadRef.current?.click()}
          disabled={uploading}
        >
          <FileUp className="h-5 w-5" />
          Upload
        </Button>
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {visible.map((attachment: any) => {
            const isSelected = selected.has(attachment.id);
            const mediaUrl = getAttachmentUrl(attachment);
            const fileName = attachment.file_name || "Attachment";

            return (
              <button
                key={attachment.id}
                type="button"
                onClick={() => toggleSelect(attachment.id)}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-lg border-2 bg-muted/30 active:scale-95 transition-transform",
                  isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                )}
                aria-pressed={isSelected}
              >
                <MediaThumbnail
                  url={mediaUrl}
                  fileName={fileName}
                  fileType={attachment.file_type}
                  className="h-full w-full rounded-none border-0"
                />
                <span className="absolute inset-x-0 bottom-0 bg-background/90 px-1 py-0.5 text-[9px] text-foreground line-clamp-1">
                  {fileName}
                </span>
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                    <CheckCircle2 className="h-8 w-8 text-primary drop-shadow-lg" fill="white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 active:bg-muted/60"
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </>
          ) : (
            <>
              <Camera className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {isLoading ? "Loading..." : "Tap to snap first photo"}
              </span>
            </>
          )}
        </button>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-2 z-10 -mx-4 px-4 pb-1 pt-2">
          <div className="space-y-2 rounded-xl border border-border bg-card p-2 shadow-lg">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium text-foreground">
                {selected.size} selected - only these will be sent
              </p>
              <button
                type="button"
                onClick={clearSelection}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                className="h-10 gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
                onClick={handleShareCustomer}
                disabled={sharing !== null || !customerPhone}
              >
                {sharing === "customer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Customer
              </Button>
              <Button
                size="sm"
                className="h-10 gap-1.5 bg-blue-500 text-white hover:bg-blue-600"
                onClick={handleShareDispatch}
                disabled={sharing !== null}
              >
                {sharing === "dispatch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Dispatch
              </Button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept={CAMERA_ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );

  if (bare) return body;

  return (
    <Card className="overflow-hidden">
      <div className="flex h-12 items-center border-b border-border px-4">
        <ImagePlus className="mr-2 h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
        {attachmentCount > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">({attachmentCount})</span>
        )}
        <Link to={`/photos/${jobId}`} className="ml-auto text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      {body}
    </Card>
  );
}
