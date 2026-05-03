import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { resolveStorageMediaUrl } from "@/lib/mediaUrls";
import { CLOSED_CART_STATUS_FILTER } from "@/lib/appLifecycle";
import { logClientSystemError } from "@/lib/systemErrorLog";

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
  cardStatus?: string | null;
  latestCommunicationAt?: string | null;
  latestCommunicationType?: string | null;
  latestCommunicationSummary?: string | null;
  openAlertCount?: number;
  highestAlertSeverity?: string | null;
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
  cartItemCount: number;
  repairItemCount: number;
  cartStatus?: string | null;
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
      { table: "job_carts", queryKeys: [["job_cart"], ["dispatch-live-cards"]] },
      { table: "job_cart_items", queryKeys: [["job_cart_items"], ["dispatch-live-cards"]] },
      { table: "service_repair_items", queryKeys: [["dispatch-live-cards"]] },
      { table: "job_transcripts", queryKeys: [["dispatch-live-cards"]] },
      { table: "tech_forms", queryKeys: [["dispatch-live-cards"]] },
      { table: "tech_form_photos", queryKeys: [["tech_form_photos"], ["dispatch-live-cards"]] },
      { table: "tech_form_responses", queryKeys: [["tech_form_responses"], ["dispatch-live-cards"]] },
      { table: "sms_log", queryKeys: [["dispatch-live-cards"]] },
      { table: "call_log", queryKeys: [["dispatch-live-cards"]] },
      { table: "workflow_alerts", queryKeys: [["dispatch-live-cards"]] },
      { table: "intake_thread_status", queryKeys: [["dispatch-live-cards"]] },
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
          cartItemCount: 0,
          repairItemCount: 0,
          liveSummary: "Waiting for field updates.",
          liveTone: "quiet",
        });
      }

      const [readModelRes, transcriptsRes, activityRes, attachmentsRes, formsRes, cartsRes, repairItemsRes] = await Promise.all([
        (supabase as any)
          .from("v_dispatch_live_cards")
          .select("job_id, card_status, latest_communication_at, latest_communication_type, latest_communication_summary, open_alert_count, highest_alert_severity, attachment_count, latest_attachment_at")
          .in("job_id", stableJobIds),
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
        // Pull attachments matching by EITHER job_id or estimate_id. The schedule
        // includes estimates as items too, and a row's estimate_id is populated when
        // the attachment was tied to an estimate (e.g. customer-sent MMS photos
        // visible from the estimate context). Without this OR, estimate-anchored
        // photos look invisible from the schedule modal.
        supabase
          .from("job_attachments")
          .select("id, job_id, estimate_id, customer_id, file_name, file_path, file_type, storage_bucket, created_at")
          .or(
            `job_id.in.(${stableJobIds.join(",")}),estimate_id.in.(${stableJobIds.join(",")})`
          )
          .order("created_at", { ascending: false })
          .limit(400),
        supabase
          .from("tech_forms")
          .select("id, job_id")
          .in("job_id", stableJobIds),
        (supabase as any)
          .from("job_carts")
          .select("id, job_id, status, total, sent_at, approved_at, paid_at, created_at")
          .in("job_id", stableJobIds)
          .not("status", "in", CLOSED_CART_STATUS_FILTER)
          .order("created_at", { ascending: false })
          .limit(250),
        (supabase as any)
          .from("service_repair_items")
          .select("id, job_id, created_at")
          .in("job_id", stableJobIds)
          .order("created_at", { ascending: false })
          .limit(400),
      ]);

      if (readModelRes.error) {
        console.warn("Dispatch live read model unavailable; using raw field context only:", readModelRes.error.message);
        void logClientSystemError({
          sourceName: "dispatch-live-cards",
          message: readModelRes.error.message || "Dispatch live read model unavailable",
          severity: "warning",
          context: {
            table: "v_dispatch_live_cards",
            job_count: stableJobIds.length,
          },
        });
      }
      if (transcriptsRes.error) throw transcriptsRes.error;
      if (activityRes.error) throw activityRes.error;
      if (attachmentsRes.error) throw attachmentsRes.error;
      if (formsRes.error) throw formsRes.error;
      if (cartsRes.error) throw cartsRes.error;
      if (repairItemsRes.error) {
        console.warn("Repair item context unavailable for dispatch live cards:", repairItemsRes.error.message);
        void logClientSystemError({
          sourceName: "dispatch-live-cards",
          message: repairItemsRes.error.message || "Repair item context unavailable",
          severity: "warning",
          context: {
            table: "service_repair_items",
            job_count: stableJobIds.length,
          },
        });
      }

      const readModelByJob = new Map<string, any>();
      for (const row of ((readModelRes.error ? [] : readModelRes.data || []) as any[])) {
        if (row.job_id) readModelByJob.set(row.job_id, row);
      }

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

      const cartRows = ((cartsRes.data || []) as any[]);
      const cartIds = cartRows.map((cart) => cart.id).filter(Boolean);
      const cartItemsRes = cartIds.length
        ? await (supabase as any)
            .from("job_cart_items")
            .select("cart_id")
            .in("cart_id", cartIds)
        : { data: [], error: null };
      if (cartItemsRes.error) throw cartItemsRes.error;

      const cartToJob = new Map<string, string>();
      const latestCartByJob = new Map<string, any>();
      for (const cart of cartRows) {
        cartToJob.set(cart.id, cart.job_id);
        if (cart.job_id && !latestCartByJob.has(cart.job_id)) latestCartByJob.set(cart.job_id, cart);
      }

      const cartItemCountByJob = new Map<string, number>();
      for (const item of ((cartItemsRes.data || []) as any[])) {
        const jobId = cartToJob.get(item.cart_id);
        if (!jobId) continue;
        cartItemCountByJob.set(jobId, (cartItemCountByJob.get(jobId) || 0) + 1);
      }

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

      // Bucket attachments under EVERY relevant key (job_id and estimate_id) so a
      // single row that's tied to both a job and an estimate appears in both contexts.
      // This keeps the count and the gallery accurate for items that originated as
      // an estimate but later got tied to a job, or vice versa.
      const attachmentsByJob = new Map<string, DispatchLiveAttachment[]>();
      for (const attachment of (attachmentsRes.data || []) as any[]) {
        const url = typeof attachment.file_path === "string" && attachment.file_path.startsWith("http")
          ? attachment.file_path
          : resolveStorageMediaUrl(attachment.file_path, attachment.storage_bucket || "job-photos");
        const dispatchAttachment: DispatchLiveAttachment = {
          id: attachment.id,
          jobId: attachment.job_id,
          fileName: attachment.file_name || "Attachment",
          url,
          fileType: attachment.file_type,
          createdAt: attachment.created_at,
          source: "job_attachment",
          badge: "Attachment",
        };
        // Add to the job_id bucket if present and that key is one we're tracking.
        if (attachment.job_id && contexts.has(attachment.job_id)) {
          const list = attachmentsByJob.get(attachment.job_id) || [];
          list.push(dispatchAttachment);
          attachmentsByJob.set(attachment.job_id, list);
        }
        // Add to the estimate_id bucket too — a single attachment is visible from
        // both the job AND the estimate when both columns are populated.
        if (attachment.estimate_id && contexts.has(attachment.estimate_id)) {
          const list = attachmentsByJob.get(attachment.estimate_id) || [];
          list.push(dispatchAttachment);
          attachmentsByJob.set(attachment.estimate_id, list);
        }
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

      const repairCountByJob = new Map<string, number>();
      for (const repair of ((repairItemsRes.error ? [] : repairItemsRes.data || []) as any[])) {
        if (!repair.job_id) continue;
        repairCountByJob.set(repair.job_id, (repairCountByJob.get(repair.job_id) || 0) + 1);
      }

      for (const jobId of stableJobIds) {
        const current = contexts.get(jobId)!;
        const readModel = readModelByJob.get(jobId);
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
        const latestCart = latestCartByJob.get(jobId);
        const cartItemCount = cartItemCountByJob.get(jobId) || 0;
        const repairItemCount = repairCountByJob.get(jobId) || 0;
        const proposalSummary = latestCart
          ? latestCart.status === "approved"
            ? `Customer approved proposal for $${Number(latestCart.total || 0).toFixed(2)}.`
            : latestCart.status === "sent"
              ? `Proposal sent to customer with ${cartItemCount || "no"} option${cartItemCount === 1 ? "" : "s"}.`
              : cartItemCount > 0
                ? `Proposal drafted with ${cartItemCount} option${cartItemCount === 1 ? "" : "s"}.`
                : ""
          : repairItemCount > 0
            ? `${repairItemCount} repair item${repairItemCount === 1 ? "" : "s"} added by tech.`
            : "";
        const liveSummary =
          shortText(latestTranscript?.ai_response, 135) ||
          shortText(latestTranscript?.transcript_text, 135) ||
          shortText(proposalSummary, 135) ||
          shortText(readModel?.latest_communication_summary, 135) ||
          shortText(latestActivity?.details, 135) ||
          (attachments.length ? `${attachments.length} field attachment${attachments.length === 1 ? "" : "s"} available.` : "Waiting for field updates.");
        const liveTone = latestTranscript || suggestedItemCount > 0 || latestCart?.status === "approved" || Number(readModel?.open_alert_count || 0) > 0
          ? "attention"
          : attachments.length || responseCount > 0 || latestActivity || latestCart || repairItemCount > 0 || readModel?.latest_communication_summary
            ? "active"
            : "quiet";

        contexts.set(jobId, {
          ...current,
          cardStatus: readModel?.card_status || null,
          latestCommunicationAt: readModel?.latest_communication_at || null,
          latestCommunicationType: readModel?.latest_communication_type || null,
          latestCommunicationSummary: readModel?.latest_communication_summary || null,
          openAlertCount: Number(readModel?.open_alert_count || 0),
          highestAlertSeverity: readModel?.highest_alert_severity || null,
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
          cartItemCount,
          repairItemCount,
          cartStatus: latestCart?.status || null,
          liveSummary,
          liveTone,
        });
      }

      return contexts;
    },
  });
}
