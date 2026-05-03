import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera } from "lucide-react";
import { MediaGallery, type MediaGalleryItem } from "@/components/media";
import { toast } from "sonner";
import { resolveStorageMediaUrl } from "@/lib/mediaUrls";

type PhotoItem = MediaGalleryItem & {
  source: "attachment" | "tech_form";
  photo_type?: string | null;
  created_at?: string | null;
  sourcePhotoId?: string;
};

export function JobPhotosGrid({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();

  // The id passed in here is the URL param :id, which is a JOB id on /jobs/:id but
  // an ESTIMATE id on /estimates/:id (parent component reuses this surface for both).
  // Match by either column so attachments tied to an estimate (via the new estimate_id
  // column) surface here too. UUID space doesn't collide, so this is safe.
  const { data: localPhotos, isLoading: loadingAttachments } = useQuery({
    queryKey: ["job_attachments", jobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("job_attachments")
        .select("id, file_name, file_path, file_type, storage_bucket, created_at")
        .or(`job_id.eq.${jobId},estimate_id.eq.${jobId}`);
      return (data || []).map<PhotoItem>((p: any) => ({
        id: p.id,
        fileName: p.file_name,
        // file_path may already be a full https URL (MMS download); only resolve
        // through storage when it's a relative path.
        url: typeof p.file_path === "string" && p.file_path.startsWith("http")
          ? p.file_path
          : resolveStorageMediaUrl(p.file_path, p.storage_bucket || "job-photos"),
        fileType: p.file_type || "image/jpeg",
        source: "attachment" as const,
        photo_type: null,
        created_at: p.created_at,
        sourcePhotoId: p.id,
      }));
    },
  });

  const { data: techPhotos, isLoading: loadingTech } = useQuery({
    queryKey: ["tech_form_photos_grid", jobId],
    queryFn: async () => {
      const { data: forms } = await supabase
        .from("tech_forms")
        .select("id")
        .eq("job_id", jobId);
      if (!forms || forms.length === 0) return [];
      const formIds = forms.map((f) => f.id);
      const { data: photos } = await supabase
        .from("tech_form_photos")
        .select("id, file_path, photo_type, created_at")
        .in("tech_form_id", formIds)
        .order("created_at", { ascending: false });
      return (photos || []).map<PhotoItem>((p) => {
        const fileName = p.file_path.split("/").pop() || "photo";
        return {
          id: p.id,
          fileName,
          url: resolveStorageMediaUrl(p.file_path, "tech-form-photos"),
          fileType: "image/jpeg",
          source: "tech_form" as const,
          photo_type: p.photo_type,
          created_at: p.created_at,
          badge: photoTypeLabel(p.photo_type) || "Tech Form",
        };
      });
    },
  });

  const isLoading = loadingAttachments || loadingTech;
  const photos: PhotoItem[] = [
    ...(techPhotos || []),
    ...(localPhotos || []),
  ].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });

  const handleAnnotated = async (item: MediaGalleryItem & { sourcePhotoId?: string }, blob: Blob) => {
    try {
      const baseName = (item.fileName || "photo").replace(/\.[^/.]+$/, "");
      const fileName = `${baseName}_annotated_${Date.now()}.png`;
      const path = `${jobId}/${fileName}`;

      const { error: upErr } = await supabase.storage
        .from("job-photos")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("job_attachments").insert({
        job_id: jobId,
        file_name: fileName,
        file_path: path,
        file_type: "image/png",
        is_annotated: true,
        parent_attachment_id: item.sourcePhotoId ?? null,
      } as any);
      if (insErr) throw insErr;

      toast.success("Annotation saved");
      queryClient.invalidateQueries({ queryKey: ["job_attachments", jobId] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to save annotation");
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <Camera className="h-5 w-5 mx-auto mb-2" />
        No photos found yet
      </div>
    );
  }

  return (
    <div className="p-4">
      <MediaGallery
        items={photos}
        gridClassName="grid grid-cols-3 sm:grid-cols-4 gap-2"
        onAnnotated={handleAnnotated as any}
      />
    </div>
  );
}

function photoTypeLabel(type: string | null | undefined) {
  if (!type) return null;
  const labels: Record<string, string> = {
    data_plate: "Data Plate",
    supply_ticket: "Supply Ticket",
    before: "Before",
    after: "After",
    general: "General",
  };
  return labels[type] || type;
}
