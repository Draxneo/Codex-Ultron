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
import { invalidateActionItemQueues } from "@/lib/actionItemLifecycle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
          // Use full employee name — HCP employee record is "Jonathan Carnes", and
          // create-hcp-job's .eq("name", assigned_to) lookup needs an exact match to
          // resolve the hcp_employee_id and dispatch the job. Just "Jonathan" silently
          // resolves to no match and the job ends up unassigned in HCP.
          assigned_to: m.assigned_to || "Jonathan Carnes",
          scheduled_date: m.scheduled_date || null,
          scheduled_time: m.scheduled_time || null,
          action_item_id,
          created_by: user?.id || "Dispatcher",
          is_estimate: m.job_type === "estimate",
        };

        console.log("[useBookingAction] customer-actions create_job payload:", body);
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
            scheduled_start: body.scheduled_date && body.scheduled_time
              ? `${body.scheduled_date}T${body.scheduled_time}:00`
              : null,
            action_item_id,
            created_by: body.created_by,
            is_estimate: body.is_estimate,
          },
        });

        console.log("[useBookingAction] customer-actions create_job response:", { jobResult, jobError });

        if (jobError) throw new Error(jobError.message || "Edge function call failed");
        if (!jobResult) throw new Error("No response from booking function");
        if (jobResult.error) throw new Error(jobResult.error);
        if (!jobResult.job?.id) throw new Error("UltraOffice did not return a job id");

        const result: BookingResult = {
          ok: true,
          job_id: jobResult.job.id,
          job_number: jobResult.job.job_number ? String(jobResult.job.job_number) : undefined,
          type: body.is_estimate ? "estimate" : "job",
          scheduled: Boolean(body.scheduled_date),
        };

        setState(action_item_id, { phase: "syncing", result });

        const refNum = result.job_number || result.job_id;
        toast.success(
          `${result.type === "estimate" ? "Estimate" : "Job"} #${refNum} created`
        );

        invalidateActionItemQueues(qc);
        qc.invalidateQueries({ queryKey: ["jobs"] });
        qc.invalidateQueries({ queryKey: ["dispatch-jobs"] });

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

