import { useCustomerPhotos } from "@/hooks/useCustomerHistory";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { ImageIcon, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { MediaGallery, type MediaGalleryItem } from "@/components/media";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Photo = {
  id: string;
  url: string;
  file_name: string;
  job_id: string | null;
  created_at: string | null;
  source: "attachment" | "tech_form";
  photo_type: string | null;
  job_number: string | null;
  job_type: string | null;
  scheduled_date: string | null;
  job_description: string | null;
};

function formatDate(d: string | null | undefined, fallback = "Unknown date") {
  if (!d) return fallback;
  try {
    return format(parseISO(d), "MMM d, yyyy");
  } catch {
    return fallback;
  }
}

function jobTypeLabel(t: string | null) {
  if (!t) return "Job";
  const map: Record<string, string> = {
    service: "Service",
    install: "Install",
    maintenance: "Maintenance",
    estimate: "Estimate",
    repair: "Repair",
  };
  return map[t.toLowerCase()] || t;
}

export function AttachmentsTab({ customerId }: { customerId: string }) {
  const { data: photos = [], isLoading } = useCustomerPhotos(customerId);
  const [filter, setFilter] = useState("all");
  const queryClient = useQueryClient();

  const filtered = (photos as Photo[]).filter((p) => {
    if (filter === "all") return true;
    if (filter === "tech") return p.source === "tech_form";
    if (filter === "jobs") return p.source === "attachment";
    return true;
  });

  const handleAnnotated = async (
    item: MediaGalleryItem & { jobId?: string | null; sourcePhotoId?: string },
    blob: Blob,
  ) => {
    try {
      const jobId = item.jobId;
      if (!jobId) {
        toast.error("Cannot save annotation — original photo is not linked to a job");
        return;
      }
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
      queryClient.invalidateQueries({ queryKey: ["customer-photos", customerId] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to save annotation");
    }
  };

  // Group by job_id (null bucket for orphans), preserving newest-first order
  const groups = useMemo(() => {
    const map = new Map<string, { jobId: string | null; photos: Photo[]; sample: Photo }>();
    for (const p of filtered) {
      const key = p.job_id || "__no_job__";
      const existing = map.get(key);
      if (existing) {
        existing.photos.push(p);
      } else {
        map.set(key, { jobId: p.job_id, photos: [p], sample: p });
      }
    }
    // Sort groups: jobs with a scheduled_date desc, then by created_at desc
    return Array.from(map.values()).sort((a, b) => {
      const da = a.sample.scheduled_date
        ? new Date(a.sample.scheduled_date).getTime()
        : a.sample.created_at
        ? new Date(a.sample.created_at).getTime()
        : 0;
      const db = b.sample.scheduled_date
        ? new Date(b.sample.scheduled_date).getTime()
        : b.sample.created_at
        ? new Date(b.sample.created_at).getTime()
        : 0;
      return db - da;
    });
  }, [filtered]);

  return (
    <Card className="shadow-none border p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold">{photos.length} attachments</h2>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="h-8 p-0.5">
            <TabsTrigger value="all" className="text-xs h-7 px-3">All</TabsTrigger>
            <TabsTrigger value="jobs" className="text-xs h-7 px-3">Jobs</TabsTrigger>
            <TabsTrigger value="tech" className="text-xs h-7 px-3">Tech form</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No attachments</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ jobId, photos: groupPhotos, sample }) => {
            const jobLabel = sample.job_number
              ? `Job #${sample.job_number}`
              : jobId
              ? "Job"
              : "Unlinked";
            const dateLabel = formatDate(
              sample.scheduled_date || sample.created_at,
              "No date",
            );

            return (
              <section key={jobId || "__no_job__"} className="space-y-2">
                {/* Group header */}
                <div className="flex items-center justify-between gap-3 pb-1.5 border-b">
                  <div className="flex items-center gap-2 flex-wrap">
                    {jobId ? (
                      <Link
                        to={`/jobs/${jobId}`}
                        className="text-sm font-bold hover:underline inline-flex items-center gap-1"
                      >
                        {jobLabel}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </Link>
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">
                        {jobLabel}
                      </span>
                    )}
                    {sample.job_type && (
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {jobTypeLabel(sample.job_type)}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground font-medium">
                      {dateLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({groupPhotos.length} {groupPhotos.length === 1 ? "photo" : "photos"})
                    </span>
                  </div>
                </div>

                {/* Photo grid wired to lightbox */}
                <MediaGallery
                  items={groupPhotos.map<MediaGalleryItem & { jobId?: string | null; sourcePhotoId?: string }>((p) => ({
                    id: p.id,
                    url: p.url,
                    fileName: p.file_name,
                    badge: p.source === "tech_form" ? "Tech" : undefined,
                    caption: `${p.file_name} · ${formatDate(p.created_at, "")}${
                      p.photo_type ? ` · ${p.photo_type.replace(/_/g, " ")}` : ""
                    }`,
                    jobId: p.job_id,
                    sourcePhotoId: p.source === "attachment" ? p.id : undefined,
                  }))}
                  onAnnotated={handleAnnotated as any}
                />
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
