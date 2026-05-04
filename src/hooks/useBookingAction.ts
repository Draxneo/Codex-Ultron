/**
 * useBookingAction — Shared booking helper used by:
 *  - BookingIntentAlert (desktop popup)
 *  - ActionItemCards (JARVIS decision queue)
 *  - IntakeActionCards (CSR softphone)
 *
 * Centralizes the UltraOffice booking flow so all three surfaces share identical
 * customer resolution, payload shape, error handling, and result reporting.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { normalizeMediaAttachments } from "@/lib/mediaAttachments";
import {
  ACTION_ITEM_STATUS,
  invalidateActionItemQueues,
  resolveActionItem,
} from "@/lib/actionItemLifecycle";
import { detectCentralOffset, formatDateFriendly } from "@/lib/formatters";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function debugBooking(message: string, detail?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.debug(`[useBookingAction] ${message}`, detail);
}

function cleanText(value?: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatBlockLabel(start?: string | null, end?: string | null) {
  if (!start) return "";
  const toHour = (value: string) => {
    const [hourRaw] = value.split(":");
    const hour = Number(hourRaw);
    if (!Number.isFinite(hour)) return value;
    const hour12 = hour % 12 || 12;
    return String(hour12);
  };
  return end ? `${toHour(start)} to ${toHour(end)}` : toHour(start);
}

function buildHandledReceipt(input: {
  metadata: Record<string, any>;
  jobId?: string | null;
  jobNumber?: string | null;
  type?: "job" | "estimate";
}) {
  const meta = input.metadata || {};
  const date = cleanText(meta.scheduled_date);
  const block = formatBlockLabel(meta.scheduled_time, meta.scheduled_end);
  const dateLabel = date ? formatDateFriendly(date) || date : "";
  const workReason =
    cleanText(meta.work_reason) ||
    cleanText(meta.description) ||
    cleanText(meta.quote_subject) ||
    cleanText(meta.quote_options_requested) ||
    cleanText(meta.suggested_action) ||
    "Scheduled work";
  const assignedTo = cleanText(meta.assigned_to);
  const scheduledLabel = [dateLabel, block].filter(Boolean).join(", ");
  const handledLabel = scheduledLabel ? `Scheduled ${scheduledLabel}` : "Scheduled";

  return {
    handled_outcome: "scheduled",
    handled_label: handledLabel,
    handled_detail: [
      assignedTo ? `Assigned to ${assignedTo}` : "",
      workReason ? `Work: ${workReason}` : "",
    ].filter(Boolean).join(" - "),
    handled_work_reason: workReason,
    handled_owner: assignedTo || null,
    handled_job_id: input.type === "job" ? input.jobId || null : null,
    handled_estimate_id: input.type === "estimate" ? input.jobId || null : null,
    handled_job_number: input.jobNumber || null,
    handled_type: input.type || "job",
    scheduled_date: date || null,
    scheduled_time: meta.scheduled_time || null,
    scheduled_end: meta.scheduled_end || null,
  };
}

function centralDateTime(date?: string | null, time?: string | null) {
  if (!date || !time) return null;
  return `${date}T${time}:00${detectCentralOffset(date)}`;
}

function collectActionMedia(metadata: Record<string, any>) {
  const candidates = [
    metadata.media_urls,
    metadata.mediaUrls,
    metadata.sms_media_urls,
    metadata.source_sms_media_urls,
    metadata.attachments,
    metadata.sms_extraction?.media_urls,
    metadata.sms_extraction?.attachments,
  ];

  const seen = new Set<string>();
  return candidates
    .flatMap((candidate) => normalizeMediaAttachments(candidate))
    .filter((item) => {
      const key = item.url.split("?")[0];
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function attachActionMediaToJob(jobId: string, metadata: Record<string, any>) {
  const media = collectActionMedia(metadata);
  if (!jobId || media.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from("job_attachments" as any)
    .select("file_path")
    .eq("job_id", jobId);
  if (existingError) throw existingError;

  const existingPaths = new Set(((existing || []) as any[]).map((row) => String(row.file_path || "").split("?")[0]));
  const inserts = media
    .filter((item) => !existingPaths.has(item.url.split("?")[0]))
    .map((item, index) => ({
      job_id: jobId,
      file_name: item.fileName || `sms-photo-${index + 1}.jpg`,
      file_path: item.url,
      file_type: item.fileType || "image/jpeg",
      category: "sms",
      hidden_from_tech_share: false,
    }));

  if (inserts.length === 0) return;
  const { error } = await supabase.from("job_attachments" as any).insert(inserts);
  if (error) throw error;
}

export type BookingPhase = "idle" | "resolving" | "booking" | "syncing" | "booked" | "failed";

export type BookingResult = {
  ok: boolean;
  job_id?: string;
  job_number?: string;
  type?: "job" | "estimate";
  scheduled?: boolean;
  error?: string;
};

export type BookingState = {
  phase: BookingPhase;
  result: BookingResult | null;
  error: string | null;
};

export type BookingInput = {
  action_item_id: string;
  metadata: any;
  description?: string | null;
  customer_phone?: string | null;
};

export function useBookingAction() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [states, setStates] = useState<Record<string, BookingState>>({});

  const setState = useCallback((id: string, patch: Partial<BookingState>) => {
    setStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { phase: "idle", result: null, error: null }), ...patch },
    }));
  }, []);

  const getState = useCallback(
    (id: string): BookingState => states[id] || { phase: "idle", result: null, error: null },
    [states]
  );

  const book = useCallback(
    async (input: BookingInput): Promise<BookingResult> => {
      const { action_item_id, metadata, description, customer_phone } = input;
      const m = (metadata || {}) as any;

      setState(action_item_id, { phase: "resolving", error: null, result: null });

      try {
        // Resolve local customer_id (handle hcp_customer_id strings + phone fallback)
        let resolvedCustomerId =
          typeof m.customer_id === "string" ? m.customer_id.trim() : null;
        if (resolvedCustomerId && !UUID_RE.test(resolvedCustomerId)) {
          const { data: hcpCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("hcp_customer_id", resolvedCustomerId)
            .maybeSingle();
          resolvedCustomerId = hcpCustomer?.id ?? null;
        }
        const phone = m.customer_phone || m.phone || customer_phone;
        if (!resolvedCustomerId && phone) {
          const digits = String(phone).replace(/\D/g, "").slice(-10);
          if (digits.length === 10) {
            const { data: matched } = await supabase
              .rpc("find_customer_by_phone", { digits })
              .limit(1)
              .maybeSingle();
            resolvedCustomerId = (matched as any)?.id ?? null;
          }
        }

        const body = {
          customer_id: resolvedCustomerId,
          customer_name: m.customer_name || "Unknown",
          customer_phone: phone || null,
          customer_email: m.customer_email || m.email || null,
          description: m.description || description || "Service call",
          job_type: m.job_type || "service",
          address: m.address || null,
          // Use full employee name so local assignment and tech routing match the roster.
          assigned_to: m.assigned_to || "Jonathan Carnes",
          additional_assignees: Array.isArray(m.additional_assignees)
            ? m.additional_assignees
            : Array.isArray(m.team_members)
              ? m.team_members
              : [],
          scheduled_date: m.scheduled_date || null,
          scheduled_time: m.scheduled_time || null,
          scheduled_end: m.scheduled_end || null,
          action_item_id,
          created_by: user?.id || "Dispatcher",
          is_estimate: m.job_type === "estimate",
          override_active_work: m.override_active_work === true,
        };

        debugBooking("creating job from action item", {
          action_item_id,
          customer_id: body.customer_id || null,
          job_type: body.job_type,
          has_phone: Boolean(body.customer_phone),
          has_email: Boolean(body.customer_email),
          has_address: Boolean(body.address),
          scheduled: Boolean(body.scheduled_date),
        });
        setState(action_item_id, { phase: "booking" });

        const { data: jobResult, error: jobError } = await supabase.functions.invoke("customer-actions", {
          body: {
            mode: "create_job",
            customer_id: body.customer_id,
            customer_name: body.customer_name,
            customer_phone: body.customer_phone,
            customer_email: body.customer_email,
            description: body.description,
            job_type: body.job_type,
            address: body.address,
            assigned_to: body.assigned_to,
            additional_assignees: body.additional_assignees,
            scheduled_start: centralDateTime(body.scheduled_date, body.scheduled_time),
            scheduled_end: centralDateTime(body.scheduled_date, body.scheduled_end),
            action_item_id,
            created_by: body.created_by,
            is_estimate: body.is_estimate,
            override_active_work: body.override_active_work,
          },
        });

        const createdRecord = body.is_estimate ? (jobResult?.estimate || jobResult?.job) : jobResult?.job;

        debugBooking("booking function returned", {
          action_item_id,
          ok: !jobError && !jobResult?.error,
          job_id: jobResult?.job?.id || null,
          estimate_id: jobResult?.estimate?.id || null,
          error: jobError?.message || jobResult?.error || null,
        });

        if (jobError) throw new Error(jobError.message || "Edge function call failed");
        if (!jobResult) throw new Error("No response from booking function");
        if (jobResult.error) throw new Error(jobResult.error);
        if (!createdRecord?.id) throw new Error(`UltraOffice did not return a ${body.is_estimate ? "estimate" : "job"} id`);

        const result: BookingResult = {
          ok: true,
          job_id: createdRecord.id,
          job_number: body.is_estimate
            ? (createdRecord.estimate_number ? String(createdRecord.estimate_number) : undefined)
            : (createdRecord.job_number ? String(createdRecord.job_number) : undefined),
          type: body.is_estimate ? "estimate" : "job",
          scheduled: Boolean(body.scheduled_date),
        };

        setState(action_item_id, { phase: "syncing", result });

        const receipt = buildHandledReceipt({
          metadata: m,
          jobId: result.job_id,
          jobNumber: result.job_number,
          type: result.type,
        });
        try {
          if (result.type === "job") {
            await attachActionMediaToJob(result.job_id, m);
          }
        } catch (attachmentError) {
          console.warn("[useBookingAction] Job was scheduled, but SMS media did not attach.", attachmentError);
        }

        try {
          await supabase
            .from("action_items" as any)
            .update({
              job_id: result.type === "job" ? result.job_id : null,
              metadata: {
                ...m,
                ...receipt,
                related_estimate_id: result.type === "estimate" ? result.job_id : (m.related_estimate_id || null),
              },
            })
            .eq("id", action_item_id);

          const sourceEventId =
            m.source_event_id ||
            m.inbound_sms_log_id ||
            m.sms_log_id ||
            m.call_id ||
            null;
          const sourceTable =
            m.source_table ||
            (m.inbound_sms_log_id || m.sms_log_id ? "sms_log" : m.call_id ? "call_log" : null);
          const communicationChannel =
            sourceTable === "call_log" || m.call_id ? "call" : "sms";
          const companyPhone =
            m.company_phone_number ||
            m.companyPhoneNumber ||
            m.called_number ||
            m.calledNumber ||
            m.to_number ||
            m.toNumber ||
            null;
          const customerPhoneForThread = body.customer_phone || m.phone || customer_phone;
          if (customerPhoneForThread) {
            await (supabase as any).rpc("mark_intake_communication_handled", {
              _channel: communicationChannel,
              _phone_number: customerPhoneForThread,
              _handled_by_name: user?.email || "Dispatcher",
              _source_table: sourceTable,
              _source_event_id: sourceEventId,
              _metadata: receipt,
              _business_unit_id: m.business_unit_id || m.businessUnitId || null,
              _company_phone_number: companyPhone,
            });
          }
        } catch (receiptError) {
          console.warn("[useBookingAction] Job was scheduled, but the intake receipt did not save.", receiptError);
        }

        await resolveActionItem({
          id: action_item_id,
          status: ACTION_ITEM_STATUS.accepted,
          userId: user?.id,
          title: `Booked ${result.type || "job"} ${result.job_number || result.job_id || ""}`.trim(),
          jobId: result.type === "job" ? result.job_id : undefined,
        });

        const refNum = result.job_number || result.job_id;
        toast.success(
          `${result.type === "estimate" ? "Estimate" : "Job"} #${refNum} created`
        );

        invalidateActionItemQueues(qc);
        qc.invalidateQueries({ queryKey: ["jobs"] });
        qc.invalidateQueries({ queryKey: ["dispatch-jobs"] });
        qc.invalidateQueries({ queryKey: ["estimates"] });
        qc.invalidateQueries({ queryKey: ["quote-pipeline-read-model"] });

        // Mark as booked after a short delay so user sees the success state
        setTimeout(() => setState(action_item_id, { phase: "booked", result }), 1500);

        return result;
      } catch (e: any) {
        const msg = e?.message || "Unknown error";
        console.error("[useBookingAction] Booking failed:", e);
        setState(action_item_id, { phase: "failed", error: msg });
        toast.error(`Booking failed: ${msg}`);
        return { ok: false, error: msg };
      }
    },
    [user, qc, setState]
  );

  const reset = useCallback((id: string) => {
    setStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return { book, getState, reset };
}

