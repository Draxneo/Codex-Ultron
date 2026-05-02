/**
 * useSendSms — THE universal client-side SMS sender.
 *
 * ⚠️  ALL outbound SMS from the app must go through this hook (or, for
 *     SMS-panel optimistic UI, useSmsLog.sendSms which wraps this hook).
 *     Do NOT call `supabase.functions.invoke("send-sms", ...)` directly
 *     anywhere else — doing so causes payload drift (contactName /
 *     contactType / related_vendor_id silently dropped) and bypasses
 *     uniform error toasts. An ESLint rule may enforce this in the future.
 *
 * Why this exists:
 *   - Vendor compose used to do TWO writes (edge fn + manual sms_log.insert)
 *     because the edge fn ignored vendor metadata. The edge fn now accepts it,
 *     so all callers can stay on a single send path.
 *   - Edge functions on the server already centralize through
 *     `_shared/smsHelper.ts` → `send-sms`. This hook is the client mirror.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logClientSystemError } from "@/lib/systemErrorLog";

export interface SendSmsArgs {
  to: string;
  body: string;
  jobId?: string | null;
  mediaUrls?: string[];
  /** Persisted to sms_log.contact_name (skips background resolution) */
  contactName?: string | null;
  /** Persisted to sms_log.contact_type (skips background resolution) */
  contactType?: "vendor" | "customer" | "employee" | "unknown" | string | null;
  /** Persisted to sms_log.related_vendor_id (powers useVendorSms scoping) */
  relatedVendorId?: string | null;
  /** Persisted to sms_log.related_customer_id */
  relatedCustomerId?: string | null;
  /** Explicit sending company line for multi-company SMS threads. */
  fromNumber?: string | null;
  /** Explicit business unit for multi-company SMS threads. */
  businessUnitId?: string | null;
  /** Logical source label (also written to x-source-function header). */
  source?: string;
  /**
   * Set to true for HITL-approved AI drafts (PendingSmsCard, OutboxPanel).
   * Manual user-typed messages should leave this off.
   */
  hitlApproved?: boolean;
  /** Optional caller-supplied client_id for optimistic dedup. */
  clientId?: string;
  /** Suppress the success/error toast (caller will display its own UX). */
  silent?: boolean;
}

export interface SendSmsResult {
  success: boolean;
  sms_log_id?: string;
  twilio_sid?: string;
  blocked?: boolean;
  queued?: boolean;
  error?: string;
}

function genClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function logSmsSendFailure(args: SendSmsArgs, message: string, blocked = false) {
  if (blocked) return;
  const digits = String(args.to || "").replace(/\D/g, "");
  void logClientSystemError({
    sourceName: args.source || "client-sms",
    message,
    severity: "error",
    context: {
      channel: "sms",
      to_last4: digits.slice(-4) || null,
      job_id: args.jobId ?? null,
      related_customer_id: args.relatedCustomerId ?? null,
      from_last4: args.fromNumber ? String(args.fromNumber).replace(/\D/g, "").slice(-4) || null : null,
      business_unit_id: args.businessUnitId ?? null,
      related_vendor_id: args.relatedVendorId ?? null,
      media_count: args.mediaUrls?.length || 0,
      hitl_approved: !!args.hitlApproved,
    },
  });
}

/**
 * Imperative one-shot sender (no React state). Useful from non-component code
 * paths (mutationFns, callbacks, hooks that already manage their own state).
 */
export async function sendSmsImpl(args: SendSmsArgs): Promise<SendSmsResult> {
  const {
    to, body, jobId, mediaUrls,
    contactName, contactType, relatedVendorId, relatedCustomerId,
    source, hitlApproved, clientId, fromNumber, businessUnitId,
  } = args;

  const payload: Record<string, unknown> = {
    to,
    body,
    job_id: jobId ?? null,
    client_id: clientId || genClientId(),
  };
  if (mediaUrls && mediaUrls.length > 0) payload.media_urls = mediaUrls;
  if (contactName) payload.contactName = contactName;
  if (contactType) payload.contactType = contactType;
  if (relatedVendorId) payload.relatedVendorId = relatedVendorId;
  if (relatedCustomerId) payload.relatedCustomerId = relatedCustomerId;
  if (fromNumber) payload.from_number = fromNumber;
  if (businessUnitId) payload.business_unit_id = businessUnitId;
  if (source) payload.source = source;

  const headers: Record<string, string> = {};
  if (hitlApproved) headers["x-hitl-approved"] = "true";
  if (source) headers["x-source-function"] = source;

  const { data, error } = await supabase.functions.invoke("send-sms", {
    body: payload,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });

  if (error) {
    // Supabase SDK puts response body on error.context for non-2xx responses.
    let msg = error.message || "Send failed";
    try {
      const ctx = await (error as any).context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch {
      if ((data as any)?.error) msg = (data as any).error;
    }
    logSmsSendFailure(args, msg);
    return { success: false, error: msg };
  }
  if (data?.error) {
    logSmsSendFailure(args, data.error);
    return { success: false, error: data.error };
  }
  if (data?.blocked) {
    logSmsSendFailure(args, "Blocked by test mode", true);
    return { success: false, blocked: true, error: "Blocked by test mode" };
  }
  if (data?.queued) return { success: true, queued: true, sms_log_id: data.sms_log_id };
  return { success: true, sms_log_id: data?.sms_log_id, twilio_sid: data?.sid };
}

/**
 * React-Query mutation wrapper. Returns `{ sendSms, sending }` plus standard
 * mutation flags. Surfaces uniform toast errors and invalidates SMS-related
 * caches (sms_log, vendor_sms, customer_sms, sms_log_by_job) on success.
 */
export function useSendSms() {
  const qc = useQueryClient();

  const mutation = useMutation<SendSmsResult, Error, SendSmsArgs>({
    mutationFn: async (args: SendSmsArgs) => {
      const result = await sendSmsImpl(args);
      if (!result.success) throw new Error(result.error || "SMS send failed");
      return result;
    },
    onSuccess: (result, args) => {
      qc.invalidateQueries({ queryKey: ["sms_log"] });
      qc.invalidateQueries({ queryKey: ["unread_sms_count"] });
      if (args.relatedVendorId) {
        qc.invalidateQueries({ queryKey: ["vendor_sms", args.relatedVendorId] });
      }
      if (args.relatedCustomerId) {
        qc.invalidateQueries({ queryKey: ["customer_sms", args.relatedCustomerId] });
      }
      if (args.jobId) {
        qc.invalidateQueries({ queryKey: ["sms_log_by_job", args.jobId] });
      }
      if (!args.silent && !result.queued) {
        toast({
          title: "SMS sent",
          description: args.contactName ? `Message sent to ${args.contactName}` : `Sent to ${args.to}`,
        });
      } else if (!args.silent && result.queued) {
        toast({ title: "SMS queued", description: "Will retry shortly." });
      }
    },
    onError: (err, args) => {
      if (args.silent) return;
      const msg = err.message || "Unknown error";
      const isBlocked =
        msg.toLowerCase().includes("test mode") ||
        msg.toLowerCase().includes("safety lock") ||
        msg.toLowerCase().includes("testing mode");
      toast({
        title: isBlocked ? "SMS Blocked" : "SMS Failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  return {
    sendSms: mutation.mutateAsync,
    sending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
