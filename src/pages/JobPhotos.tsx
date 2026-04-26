import { useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { getFileCategory } from "@/lib/fileTypes";
import { MediaThumbnail } from "@/components/ui/media-thumbnail";
import { MediaViewer } from "@/components/ui/media-viewer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface PhotoItem {
  id: string;
  url: string;
  label: string;
  source: string;
  created_at: string;
}

function useJobPhotos(jobId: string | undefined) {
  return useQuery({
    queryKey: ["job_photos_gallery", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      if (!jobId) return [];

      const photos: PhotoItem[] = [];

      // 1. Tech form photos (via tech_forms → tech_form_photos)
      const { data: techForms } = await supabase
        .from("tech_forms")
        .select("id")
        .eq("job_id", jobId);

      if (techForms && techForms.length > 0) {
        const formIds = techForms.map((f) => f.id);
        const { data: techPhotos } = await supabase
          .from("tech_form_photos")
          .select("id, file_path, photo_type, created_at")
          .in("tech_form_id", formIds)
          .order("created_at", { ascending: false });

        if (techPhotos) {
          for (const p of techPhotos) {
            const { data: urlData } = supabase.storage
              .from("tech-form-photos")
              .getPublicUrl(p.file_path);
            photos.push({
              id: p.id,
              url: urlData.publicUrl,
              label: p.photo_type || "Tech Form Photo",
              source: "Tech Form",
              created_at: p.created_at,
            });
          }
        }
      }

      // Legacy task_photos removed — all photos now via tech_form_photos or job_attachments

      // 3. Job attachments (direct job_id)
      const { data: attachments } = await supabase
        .from("job_attachments")
        .select("id, file_name, file_path, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (attachments) {
        for (const a of attachments) {
          const url = a.file_path.startsWith("http")
            ? a.file_path
            : supabase.storage.from("job-photos").getPublicUrl(a.file_path).data.publicUrl;
          photos.push({
            id: a.id,
            url,
            label: a.file_name || "Job Photo",
            source: "Job",
            created_at: a.created_at,
          });
        }
      }


      // New path: tech_forms with job_type "preinstall" → tech_form_photos
      const { data: preinstallForms } = await supabase
        .from("tech_forms")
        .select("id")
        .eq("job_id", jobId);

      if (preinstallForms && preinstallForms.length > 0) {
        const formIds = preinstallForms.map((f) => f.id);
        // Only grab photos with preinstall-related types (avoid double-counting regular tech form photos)
        const { data: newPrePhotos } = await supabase
          .from("tech_form_photos")
          .select("id, file_path, photo_type, created_at")
          .in("tech_form_id", formIds)
          .order("created_at", { ascending: false });

        if (newPrePhotos) {
          // Dedupe against photos already pulled in section 1 (tech form photos)
          const existingIds = new Set(photos.map(p => p.id));
          for (const p of newPrePhotos) {
            if (existingIds.has(p.id)) continue;
            const { data: urlData } = supabase.storage
              .from("tech-form-photos")
              .getPublicUrl(p.file_path);
            photos.push({
              id: p.id,
              url: urlData.publicUrl,
              label: p.photo_type || "Pre-Install Photo",
              source: "Pre-Install",
              created_at: p.created_at,
            });
          }
        }
      }

      return photos;
    },
    staleTime: 2 * 60 * 1000,
  });
}

export default function JobPhotos() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data: photos, isLoading } = useJobPhotos(jobId);
  const [selected, setSelected] = useState<PhotoItem | null>(null);

  // Fetch job info for header
  const { data: job } = useQuery({
    queryKey: ["job_photo_header", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data } = await supabase
        .from("jobs")
        .select("customer_name, address, hcp_job_number, scheduled_date")
        .eq("id", jobId!)
        .single();
      return data;
    },
  });

  // Group photos by source
  const grouped = (photos || []).reduce<Record<string, PhotoItem[]>>((acc, p) => {
    if (!acc[p.source]) acc[p.source] = [];
    acc[p.source].push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {job ? (
            <>
              <p className="text-sm font-semibold text-foreground">
                {job.customer_name || "Job Photos"}
              </p>
              <p className="text-xs text-muted-foreground">
                {[job.hcp_job_number && `#${job.hcp_job_number}`, job.address, job.scheduled_date]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            </>
          ) : (
            <>
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-48" />
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : !photos || photos.length === 0 ? (
          <div className="text-center py-16">
            <Camera className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No photos for this job yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([source, items]) => (
              <div key={source}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {source} Photos ({items.length})
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {items.map((p) => (
                    <MediaThumbnail
                      key={p.id}
                      url={p.url}
                      fileName={p.label}
                      onClick={() => setSelected(p)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl p-2">
          {selected && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 px-1">
                {selected.label} • {selected.source}
              </p>
              <MediaViewer url={selected.url} fileName={selected.label} maxHeightClass="max-h-[80vh]" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
