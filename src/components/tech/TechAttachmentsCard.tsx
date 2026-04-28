/**
 * TechAttachmentsCard.tsx — Camera/upload + multi-select sharing for tech jobs.
 *
 * - Camera dropzone (web-friendly file input with `capture="environment"`).
 * - Real upload pipeline: storage → job_attachments → classify-attachment.
 * - Auto-hides anything classified as supply_invoice (cost data).
 * - Multi-select tap-to-toggle on thumbnails with sticky action bar:
 *     - Share with Customer (amber)  → SMS via send-sms
 *     - Share with Dispatch (blue)   → SMS to +12106005091
 */

import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Camera, Upload, ImagePlus, Share2, Send, X, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useJobAttachments } from "@/hooks/useJobAttachments";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MediaThumbnail } from "@/components/media";

const DISPATCH_LINE = "+12106005091";

interface TechAttachmentsCardProps {
  jobId: string;
  /** Customer phone for "Share with Customer" SMS */
  customerPhone?: string | null;
  /** Job number / tech name for outgoing dispatch SMS */
  jobNumber?: string | null;
  techName?: string | null;
  /** Render without outer Card chrome */
  bare?: boolean;
}

export function TechAttachmentsCard({
  jobId,
  customerPhone,
  jobNumber,
  techName,
  bare = false,
}: TechAttachmentsCardProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: attachments = [], isLoading } = useJobAttachments(jobId);

  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<"customer" | "dispatch" | null>(null);

  // Hide any attachment flagged as a supply-house invoice
  const visible = attachments.filter((a: any) => !a.hidden_from_tech_share);

  const photoCount = visible.length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // ── Real upload pipeline ───────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let supplyInvoiceDetected = false;

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${jobId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("job-photos")
          .upload(path, file, { contentType: file.type || "image/jpeg" });
        if (upErr) {
          toast.error(`Upload failed: ${upErr.message}`);
          continue;
        }

        const { data: row, error: insErr } = await (supabase as any)
          .from("job_attachments")
          .insert({
            job_id: jobId,
            file_name: file.name,
            file_path: path,
            file_type: file.type || "image/jpeg",
          })
          .select("id")
          .single();
        if (insErr || !row?.id) {
          toast.error(`DB insert failed: ${insErr?.message || "unknown"}`);
          continue;
        }

        // Public URL for vision classifier (job-photos is a public bucket)
        const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);

        // Fire classifier in background — wait for response so UI updates correctly
        try {
          const { data: classRes } = await supabase.functions.invoke("classify-attachment", {
            body: { attachment_id: row.id, image_url: pub.publicUrl },
          });
          if ((classRes as any)?.hidden) supplyInvoiceDetected = true;
        } catch (e) {
          console.warn("classify-attachment failed (non-fatal)", e);
        }
      }

      if (supplyInvoiceDetected) {
        toast.success("✓ Pickup ticket saved to job", {
          description:
            "We recognized this as a supply-house invoice and hid it from the customer share list so costs aren't shared by mistake. It's still attached to the job for office use.",
          duration: 8000,
        });
      } else {
        toast.success("Photo uploaded");
      }

      // Bust DB-level cache + refetch
      await (supabase as any).from("job_attachment_cache").delete().eq("hcp_id", jobId);
      queryClient.invalidateQueries({ queryKey: ["job-attachments", jobId] });
    } finally {
      setUploading(false);
    }
  };

  // ── Share handlers ─────────────────────────────────────────────────
  const buildShareLinks = async (): Promise<string[]> => {
    const ids = Array.from(selected);
    const rows = visible.filter((a: any) => ids.includes(a.id));
    const urls: string[] = [];
    for (const a of rows as any[]) {
      const path = a.file_path || a.path;
      if (a.url && (a.url as string).startsWith("http") && !path) {
        urls.push(a.url);
        continue;
      }
      if (!path) continue;
      const { data, error } = await supabase.storage.from("job-photos").createSignedUrl(path, 86400);
      if (!error && data?.signedUrl) urls.push(data.signedUrl);
    }
    return urls;
  };

  const sendMms = async (to: string, body: string, mediaUrls: string[]) => {
    const { sendSmsImpl } = await import("@/hooks/useSendSms");
    const result = await sendSmsImpl({
      to, body, mediaUrls, jobId, source: "tech_attachments_share", silent: true,
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
      if (urls.length === 0) throw new Error("No shareable photos selected");
      await sendMms(customerPhone, "Photos from your service today:", urls);
      toast.success(`Sent ${urls.length} photo${urls.length === 1 ? "" : "s"} to customer`);
      clearSelection();
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    } finally {
      setSharing(null);
    }
  };

  const handleShareDispatch = async () => {
    setSharing("dispatch");
    try {
      const urls = await buildShareLinks();
      if (urls.length === 0) throw new Error("No photos selected");
      const prefix = `From ${techName || "tech"} on Job #${jobNumber || jobId.slice(0, 8)}:`;
      await sendMms(DISPATCH_LINE, prefix, urls);
      toast.success(`Sent ${urls.length} photo${urls.length === 1 ? "" : "s"} to dispatch`);
      clearSelection();
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    } finally {
      setSharing(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const body = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        {photoCount > 0 ? (
          <span className="text-xs text-muted-foreground">
            {photoCount} photo{photoCount === 1 ? "" : "s"}
            {selected.size > 0 && ` · ${selected.size} selected`}
          </span>
        ) : (
          <span />
        )}
        <Link to={`/photos/${jobId}`} className="text-xs text-primary font-medium hover:underline">
          View all
        </Link>
      </div>

      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
        <p className="text-sm font-semibold text-foreground">Capture what JARVIS needs.</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Snap the unit, model plate, failed part, readings, and the area around the repair before you talk through the options.
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-12"
          onClick={() => uploadRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4 mr-1.5" /> Upload
        </Button>
        <Button size="sm" className="flex-1 h-12" onClick={() => cameraRef.current?.click()} disabled={uploading}>
          <Camera className="h-4 w-4 mr-1.5" /> Camera
        </Button>
      </div>

      {/* Thumbnail grid (selectable) */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {visible.map((a: any) => {
            const isSelected = selected.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleSelect(a.id)}
                className={cn(
                  "relative aspect-square rounded-lg overflow-hidden border-2 bg-muted/30 active:scale-95 transition-transform",
                  isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent",
                )}
              >
                <MediaThumbnail
                  url={
                    a.url ||
                    (a.file_path
                      ? supabase.storage.from("job-photos").getPublicUrl(a.file_path).data.publicUrl
                      : "")
                  }
                  fileName={a.file_name}
                  fileType={a.file_type}
                  className="h-full w-full rounded-none border-0"
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-primary drop-shadow-lg" fill="white" />
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
          className="w-full aspect-[16/9] rounded-lg border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-2 active:bg-muted/60"
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              <span className="text-sm text-muted-foreground">Uploading…</span>
            </>
          ) : (
            <>
              <Camera className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {isLoading ? "Loading…" : "Tap to snap photo"}
              </span>
            </>
          )}
        </button>
      )}

      {/* Sticky share bar when something is selected */}
      {selected.size > 0 && (
        <div className="sticky bottom-2 z-10 -mx-4 px-4 pt-2 pb-1">
          <div className="rounded-xl border border-border bg-card shadow-lg p-2 space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-medium text-foreground">
                {selected.size} selected
              </p>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-10 bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
                onClick={handleShareCustomer}
                disabled={sharing !== null || !customerPhone}
              >
                {sharing === "customer" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                Share with Customer
              </Button>
              <Button
                size="sm"
                className="flex-1 h-10 bg-blue-500 hover:bg-blue-600 text-white gap-1.5"
                onClick={handleShareDispatch}
                disabled={sharing !== null}
              >
                {sharing === "dispatch" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Share with Dispatch
              </Button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );

  if (bare) return body;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center px-4 h-12 border-b border-border">
        <ImagePlus className="h-4 w-4 text-primary mr-2" />
        <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
        {photoCount > 0 && <span className="ml-2 text-xs text-muted-foreground">({photoCount})</span>}
        <Link to={`/photos/${jobId}`} className="ml-auto text-xs text-primary font-medium hover:underline">
          View all
        </Link>
      </div>
      {body}
    </Card>
  );
}
