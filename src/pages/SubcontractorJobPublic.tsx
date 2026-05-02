import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, Camera, CheckCircle2, Loader2, MapPin, Navigation, Phone, UploadCloud, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StreetViewThumbnail } from "@/components/tech/StreetViewThumbnail";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone } from "@/lib/formatters";
import { launchNavigation } from "@/lib/launchNavigation";
import { resolveStorageMediaUrl } from "@/lib/mediaUrls";
import { cn } from "@/lib/utils";

type SubcontractorPhoto = {
  id: string;
  file_name: string | null;
  file_path: string;
  file_type: string | null;
  category: string | null;
  created_at: string;
};

type InspectionPhoto = SubcontractorPhoto & {
  bucket: "job-photos" | "tech-form-photos";
  source: string | null;
};

type SubcontractorJobPayload = {
  token: string;
  job_id: string;
  job_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  scheduled_date: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  job_type: string | null;
  brand: string | null;
  tonnage: number | null;
  system_type: string | null;
  orientation: string | null;
  scope: string | null;
  equipment_summary: string | null;
  subcontractor_name: string | null;
  required_photo_slots: string[];
  completed_at: string | null;
  expires_at: string;
  photos: SubcontractorPhoto[];
  inspection_photos: InspectionPhoto[];
};

function slotLabel(slot: string) {
  return slot.replace(/^subcontractor_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function photoUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from("job-photos").getPublicUrl(path).data.publicUrl;
}

function inspectionPhotoUrl(photo: InspectionPhoto) {
  return resolveStorageMediaUrl(photo.file_path, photo.bucket || "job-photos");
}

function formatDate(date?: string | null) {
  if (!date) return "Date not set";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeUS(value?: string | null) {
  if (!value) return "";
  const raw = String(value).trim();
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeMatch) {
    const date = new Date();
    date.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  return raw;
}

function formatWindow(start?: string | null, end?: string | null) {
  if (!start && !end) return "Arrival window not set";
  const formatted = [formatTimeUS(start), formatTimeUS(end)].filter(Boolean);
  if (formatted.length === 2 && formatted[0] === formatted[1]) return formatted[0];
  return formatted.join(" - ");
}

function titleText(value?: string | number | null) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function equipmentSummary(job: SubcontractorJobPayload) {
  if (job.equipment_summary) return job.equipment_summary;
  return [job.brand, job.tonnage ? `${job.tonnage}-ton` : null, job.system_type, job.orientation]
    .filter(Boolean)
    .map((part) => titleText(part))
    .join(" ");
}

export default function SubcontractorJobPublic() {
  const { token } = useParams<{ token: string }>();
  const [job, setJob] = useState<SubcontractorJobPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await (supabase as any).rpc("get_public_subcontractor_job", {
      p_token: token,
    });
    if (rpcError) {
      setError(rpcError.message || "Could not open this work link.");
      setJob(null);
    } else if (!data) {
      setError("This work link is expired or no longer available.");
      setJob(null);
    } else {
      setJob(data as SubcontractorJobPayload);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  const photosBySlot = useMemo(() => {
    const map = new Map<string, SubcontractorPhoto[]>();
    for (const photo of job?.photos || []) {
      const slot = (photo.category || "subcontractor_general").replace(/^subcontractor_/, "");
      map.set(slot, [...(map.get(slot) || []), photo]);
    }
    return map;
  }, [job?.photos]);

  const handleUpload = async (slot: string, files: FileList | null) => {
    if (!token || !files || files.length === 0) return;
    setUploadingSlot(slot);
    let uploaded = 0;

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const cleanSlot = slot.toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
        const path = `subcontractor/${token}/${cleanSlot}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("job-photos")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (uploadError) throw uploadError;

        const { error: attachError } = await (supabase as any).rpc("submit_subcontractor_job_photo", {
          p_token: token,
          p_photo_slot: cleanSlot,
          p_file_name: file.name,
          p_file_path: path,
          p_file_type: file.type || null,
        });
        if (attachError) throw attachError;
        uploaded += 1;
      }

      toast.success(`${uploaded} photo${uploaded === 1 ? "" : "s"} uploaded`);
      await loadJob();
    } catch (err: any) {
      toast.error("Upload failed", { description: err?.message || "Try again." });
    } finally {
      setUploadingSlot(null);
    }
  };

  const markComplete = async () => {
    if (!token) return;
    setCompleting(true);
    const { error: completeError } = await (supabase as any).rpc("mark_subcontractor_job_complete", {
      p_token: token,
    });
    setCompleting(false);
    if (completeError) {
      toast.error("Could not mark complete", { description: completeError.message });
      return;
    }
    toast.success("Marked complete");
    await loadJob();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-5 text-white">
        <div className="mx-auto max-w-xl space-y-3">
          <Skeleton className="h-20 rounded-xl bg-white/10" />
          <Skeleton className="h-52 rounded-xl bg-white/10" />
          <Skeleton className="h-36 rounded-xl bg-white/10" />
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <Card className="max-w-md border-white/10 bg-slate-900 p-6 text-center text-white">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <h1 className="text-xl font-bold">Work link unavailable</h1>
          <p className="mt-2 text-sm text-slate-300">{error || "This link could not be opened."}</p>
        </Card>
      </div>
    );
  }

  const slots = job.required_photo_slots?.length ? job.required_photo_slots : ["before", "after"];
  const completed = Boolean(job.completed_at);
  const formattedPhone = formatPhone(job.customer_phone) || job.customer_phone || "";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-4 pb-8">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-xl">
          <StreetViewThumbnail address={job.address} className="rounded-none" />
          <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Carnes and Sons</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight">{job.customer_name || "Install Job"}</h1>
              <p className="mt-1 text-sm text-slate-300">Job {job.job_number || job.job_id.slice(0, 8)}</p>
            </div>
            <Badge className={cn("shrink-0", completed ? "bg-emerald-500 text-white" : "bg-amber-500 text-slate-950")}>
              {completed ? "Complete" : "Open"}
            </Badge>
          </div>

          <div className="mt-4 grid gap-2">
            <InfoRow icon={MapPin} label="Address" value={job.address || "Address not set"} />
            <InfoRow icon={CalendarClock} label="Schedule" value={`${formatDate(job.scheduled_date)} - ${formatWindow(job.arrival_start, job.arrival_end)}`} />
            {formattedPhone ? <InfoRow icon={Phone} label="Customer Phone" value={formattedPhone} /> : null}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {job.address ? (
              <Button className="h-12 gap-2 bg-amber-500 text-slate-950 hover:bg-amber-400" onClick={() => launchNavigation(job.address!)}>
                <Navigation className="h-4 w-4" />
                Navigate
              </Button>
            ) : null}
            {formattedPhone ? (
              <Button asChild variant="outline" className="h-12 gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10">
                <a href={`tel:${job.customer_phone}`}>
                  <Phone className="h-4 w-4" />
                  Call Customer
                </a>
              </Button>
            ) : null}
          </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-slate-900 p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Wrench className="h-5 w-5 text-amber-300" />
            Work to complete
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
            {job.scope || "No scope has been entered yet."}
          </p>
          {equipmentSummary(job) ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Equipment</p>
              <p className="mt-1 text-sm font-semibold text-white">{equipmentSummary(job)}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-white/10 bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Photos from the office</h2>
              <p className="text-sm text-slate-400">Use these inspection photos to plan materials before pickup.</p>
            </div>
            <Camera className="h-6 w-6 text-amber-300" />
          </div>

          {job.inspection_photos?.length ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {job.inspection_photos.map((photo) => (
                <a
                  key={`${photo.bucket}-${photo.id}`}
                  href={inspectionPhotoUrl(photo)}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-xl border border-white/10 bg-slate-950"
                >
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={inspectionPhotoUrl(photo)}
                      alt={photo.file_name || "Inspection photo"}
                      className="h-full w-full object-cover transition group-active:scale-95"
                    />
                  </div>
                  <div className="truncate border-t border-white/10 px-2 py-1 text-[11px] text-slate-300">
                    {slotLabel(photo.category || photo.source || "Photo")}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-slate-950/60 p-4 text-sm text-slate-400">
              No inspection photos were attached to this work link yet.
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Photos back to office</h2>
              <p className="text-sm text-slate-400">Before and after pictures are enough for most jobs.</p>
            </div>
            <Camera className="h-6 w-6 text-amber-300" />
          </div>

          <div className="mt-4 grid gap-3">
            {slots.map((slot) => {
              const slotPhotos = photosBySlot.get(slot) || [];
              const busy = uploadingSlot === slot;
              return (
                <div key={slot} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{slotLabel(slot)}</h3>
                    {slotPhotos.length > 0 ? (
                      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-200">
                        {slotPhotos.length} uploaded
                      </Badge>
                    ) : null}
                  </div>

                  {slotPhotos.length > 0 ? (
                    <div className="mb-3 grid grid-cols-4 gap-2">
                      {slotPhotos.slice(0, 8).map((photo) => (
                        <a key={photo.id} href={photoUrl(photo.file_path)} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-lg border border-white/10 bg-slate-800">
                          <img src={photoUrl(photo.file_path)} alt={photo.file_name || slot} className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  <label className={cn(
                    "flex h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-amber-400/40 bg-amber-400/10 text-sm font-bold text-amber-100 active:scale-[0.99]",
                    busy && "pointer-events-none opacity-60"
                  )}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {busy ? "Uploading..." : `Add ${slotLabel(slot)} Photos`}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void handleUpload(slot, event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <Button
          className="h-14 gap-2 bg-emerald-500 text-base font-bold text-white hover:bg-emerald-400"
          onClick={markComplete}
          disabled={completed || completing}
        >
          {completing ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          {completed ? "Work Marked Complete" : "Done - Send To Office"}
        </Button>
      </main>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}
