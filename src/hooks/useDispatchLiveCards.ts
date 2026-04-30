import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { resolveStorageMediaUrl } from "@/lib/mediaUrls";

export type DispatchLiveAttachment = {
  id: string;
  jobId: string;
  fileName: string;
  url: string;
  fileType?: string | null;
  createdAt?: string | null;
  source: "job_attachment" | "tech_form_photo";
  badge?: string;
};

export type DispatchLiveCardContext = {
  jobId: string;
  latestTechNote?: {
    text: string;
    aiResponse?: string | null;
    createdAt?: string | null;
  };
  latestActivity?: {
    action?: string | null;
    details?: string | null;
    performedBy?: string | null;
    createdAt?: string | null;
  };
  attachmentCount: number;
  latestAttachment?: DispatchLiveAttachment;
  responseCount: number;
  suggestedItemCount: number;
  liveSummary: string;
  liveTone: "quiet" | "active" | "attention";
};

type TechFormRow = { id: string; job_id: string };

function latestByDate<T extends { createdAt?: string | null; created_at?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aDate = new Date(a.createdAt || a.created_at || 0).getTime();
    const bDate = new Date(b.createdAt || b.created_at || 0).getTime();
    return bDate - aDate;
  })[0];
}

function shortText(value?: string | null, limit = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
}

function countSuggestedItems(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function photoTypeLabel(type?: string | null) {
  if (!type) return "Tech photo";
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function useDispatchLiveCards(jobIds: string[]) {
  const stableJobIds = useMemo(() => Array.from(new Set(jobIds.filter(Boolean))).sort(), [jobIds]);
  const jobKey = stableJobIds.join("|");

  useRealtimeInvalidation(
    [
      { table: "jobs", queryKeys: [["jobs"], ["dispatch-live-cards"]] },
      { table: "activity_log", queryKeys: [["activity_log"], ["dispatch-live-cards"]] },
      { table: "job_attachments", queryKeys: [["job_attachments"], ["dispatch-live-cards"]] },
      { table: "job_transcripts", queryKeys: [["dispatch-live-cards"]] },
      { table: "tech_forms", queryKeys: [["dispatch-live-cards"]] },
      { table: "tech_form_photos", queryKeys: [["tech_form_photos"], ["dispatch-live-cards"]] },
      { table: "tech_form_responses", queryKeys: [["tech_form_responses"], ["dispatch-live-cards"]] },
    ],
    "dispatch-live-card-context"
  );

  return useQuery({
    queryKey: ["dispatch-live-cards", jobKey],
    enabled: stableJobIds.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const contexts = new Map<string, DispatchLiveCardContext>();
      for (const jobId of stableJobIds) {
        contexts.set(jobId, {
          jobId,
          attachmentCount: 0,
          responseCount: 0,
          suggestedItemCount: 0,
          liveSummary: "Waiting for field updates.",
          liveTone: "quiet",
        });
      }

      const [transcriptsRes, activityRes, attachmentsRes, formsRes] = await Promise.all([
        (supabase as any)
          .from("job_transcripts")
          .select("id, job_id, transcript_text, ai_response, suggested_items, created_at")
          .in("job_id", stableJobIds)
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("activity_log")
          .select("id, job_id, action, details, performed_by, created_at")
          .in("job_id", stableJobIds)
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("job_attachments")
          .select("id, job_id, file_name, file_path, file_type, created_at")
          .in("job_id", stableJobIds)
          .order("created_at", { ascending: false })
          .limit(400),
        supabase
          .from("tech_forms")
          .select("id, job_id")
          .in("job_id", stableJobIds),
      ]);

      if (transcriptsRes.error) throw transcriptsRes.error;
      if (activityRes.error) throw activityRes.error;
      if (attachmentsRes.error) throw attachmentsRes.error;
      if (formsRes.error) throw formsRes.error;

      const forms = ((formsRes.data || []) as TechFormRow[]);
      const formToJob = new Map(forms.map((form) => [form.id, form.job_id]));
      const formIds = forms.map((form) => form.id);

      const [techPhotosRes, responsesRes] = formIds.length
        ? await Promise.all([
            supabase
              .from("tech_form_photos")
              .select("id, tech_form_id, file_path, photo_type, created_at")
              .in("tech_form_id", formIds)
              .order("created_at", { ascending: false })
              .limit(400),
            supabase
              .from("tech_form_responses")
              .select("id, tech_form_id, value, created_at")
              .in("tech_form_id", formIds)
              .order("created_at", { ascending: false })
              .limit(400),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];

      if (techPhotosRes.error) throw techPhotosRes.error;
      if (responsesRes.error) throw responsesRes.error;

      const transcriptsByJob = new Map<string, any[]>();
      for (const transcript of (transcriptsRes.data || []) as any[]) {
        const list = transcriptsByJob.get(transcript.job_id) || [];
        list.push(transcript);
        transcriptsByJob.set(transcript.job_id, list);
      }

      const activityByJob = new Map<string, any[]>();
      for (const activity of (activityRes.data || []) as any[]) {
        if (!activity.job_id) continue;
        const list = activityByJob.get(activity.job_id) || [];
        list.push(activity);
        activityByJob.set(activity.job_id, list);
      }

      const attachmentsByJob = new Map<string, DispatchLiveAttachment[]>();
      for (const attachment of (attachmentsRes.data || []) as any[]) {
        const list = attachmentsByJob.get(attachment.job_id) || [];
        list.push({
          id: attachment.id,
          jobId: attachment.job_id,
          fileName: attachment.file_name || "Attachment",
          url: resolveStorageMediaUrl(attachment.file_path, "job-photos"),
          fileType: attachment.file_type,
          createdAt: attachment.created_at,
          source: "job_attachment",
          badge: "Attachment",
        });
        attachmentsByJob.set(attachment.job_id, list);
      }

      for (const photo of (techPhotosRes.data || []) as any[]) {
        const jobId = formToJob.get(photo.tech_form_id);
        if (!jobId) continue;
        const fileName = String(photo.file_path || "").split("/").pop() || "Tech photo";
        const list = attachmentsByJob.get(jobId) || [];
        list.push({
          id: photo.id,
          jobId,
          fileName,
          url: resolveStorageMediaUrl(photo.file_path, "tech-form-photos"),
          fileType: "image/jpeg",
          createdAt: photo.created_at,
          source: "tech_form_photo",
          badge: photoTypeLabel(photo.photo_type),
        });
        attachmentsByJob.set(jobId, list);
      }

      const responseCountByJob = new Map<string, number>();
      for (const response of (responsesRes.data || []) as any[]) {
        const jobId = formToJob.get(response.tech_form_id);
        if (!jobId) continue;
        responseCountByJob.set(jobId, (responseCountByJob.get(jobId) || 0) + 1);
      }

      for (const jobId of stableJobIds) {
        const current = contexts.get(jobId)!;
        const latestTranscript = latestByDate(transcriptsByJob.get(jobId) || []);
        const latestActivity = latestByDate(activityByJob.get(jobId) || []);
        const attachments = (attachmentsByJob.get(jobId) || []).sort((a, b) => {
          const aDate = new Date(a.createdAt || 0).getTime();
          const bDate = new Date(b.createdAt || 0).getTime();
          return bDate - aDate;
        });

        const suggestedItemCount = (transcriptsByJob.get(jobId) || [])
          .reduce((sum, transcript) => sum + countSuggestedItems(transcript.suggested_items), 0);
        const responseCount = responseCountByJob.get(jobId) || 0;
        const liveSummary =
          shortText(latestTranscript?.ai_response, 135) ||
          shortText(latestTranscript?.transcript_text, 135) ||
          shortText(latestActivity?.details, 135) ||
          (attachments.length ? `${attachments.length} field attachment${attachments.length === 1 ? "" : "s"} available.` : "Waiting for field updates.");
        const liveTone = latestTranscript || suggestedItemCount > 0
          ? "attention"
          : attachments.length || responseCount > 0 || latestActivity
            ? "active"
            : "quiet";

        contexts.set(jobId, {
          ...current,
          latestTechNote: latestTranscript
            ? {
                text: latestTranscript.transcript_text,
                aiResponse: latestTranscript.ai_response,
                createdAt: latestTranscript.created_at,
              }
            : undefined,
          latestActivity: latestActivity
            ? {
                action: latestActivity.action,
                details: latestActivity.details,
                performedBy: latestActivity.performed_by,
                createdAt: latestActivity.created_at,
              }
            : undefined,
          attachmentCount: attachments.length,
          latestAttachment: attachments[0],
          responseCount,
          suggestedItemCount,
          liveSummary,
          liveTone,
        });
      }

      return contexts;
    },
  });
}
