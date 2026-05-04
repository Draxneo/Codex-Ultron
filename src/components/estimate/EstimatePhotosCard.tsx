/**
 * EstimatePhotosCard
 *
 * SYSTEM CONNECTIONS: reads from public.job_attachments by estimate_id.
 * SITS ON: src/pages/EstimateDetail.tsx (rendered as a TechCollapsibleCard child).
 *
 * Purpose: surface every photo that's been attached to an estimate so the
 * dispatcher / sales rep can see what the customer sent (e.g. carport photos
 * via MMS) without leaving the estimate page.
 *
 * Data model: job_attachments now carries optional estimate_id + customer_id
 * columns (added in migration job_attachments_add_estimate_and_customer_links).
 * This component reads by estimate_id only — photos can be linked to multiple
 * entities (job + estimate + customer), so a single row will appear here AND
 * on the related job/customer view if those columns are populated.
 *
 * Rule exception: this component intentionally does NOT call upsertLiveActionItem
 * or any dedup helper because it's read-only.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveStorageMediaUrl } from "@/lib/mediaUrls";

interface EstimatePhotosCardProps {
  estimateId: string;
}

type PhotoRow = {
  id: string;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
  storage_bucket: string | null;
  original_url: string | null;
  created_at: string | null;
};

/**
 * useEstimatePhotos
 *
 * Fetches every job_attachments row tied to the estimate via the new
 * estimate_id column. Sorted newest-first so the most recent customer
 * uploads are immediately visible.
 *
 * @param estimateId - UUID of the estimate. Required.
 * @returns React Query result with an array of photos (empty array when none).
 */
function useEstimatePhotos(estimateId: string) {
  return useQuery({
    queryKey: ["estimate_photos", estimateId],
    enabled: Boolean(estimateId),
    queryFn: async (): Promise<PhotoRow[]> => {
      const { data, error } = await supabase
        .from("job_attachments")
        .select("id, file_name, file_path, file_type, storage_bucket, original_url, created_at")
        .eq("estimate_id", estimateId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PhotoRow[];
    },
  });
}

export function EstimatePhotosCard({ estimateId }: EstimatePhotosCardProps) {
  const { data: photos, isLoading } = useEstimatePhotos(estimateId);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading photos…</div>;
  }
  if (!photos || photos.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No photos linked to this estimate yet. Customer-sent MMS images will appear here once attached.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => {
          // Photos created via the SMS path use mms-media bucket; the older job-photos
          // path uses job-photos. file_path may already be a fully-qualified public URL
          // (from MMS download) — resolveStorageMediaUrl handles both.
          const bucket = p.storage_bucket || "job-photos";
          const url = p.file_path?.startsWith("http")
            ? p.file_path
            : resolveStorageMediaUrl(p.file_path, bucket) || p.original_url || null;
          if (!url) return null;
          const isImage = (p.file_type || "image/").startsWith("image/");
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedUrl(url)}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted/40"
              title={p.file_name || "Attachment"}
            >
              {isImage ? (
                <img src={url} alt={p.file_name || "photo"} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedUrl(null)}
          role="dialog"
        >
          <img
            src={selectedUrl}
            alt="full size"
            className="max-h-[90dvh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
