/**
 * useSendOnMyWay - Shared hook to send the "On My Way" SMS with computed ETA.
 *
 * Any UI element can trigger the same flow: cached ETA lookup, SMS send,
 * jobs.on_my_way_sent_at update, activity log, auto clock-in, and query refresh.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { buildOnMyWaySms } from "@/lib/smsCopy";
import { logClientSystemError } from "@/lib/systemErrorLog";
import { getJobCompanyName } from "@/lib/jobCompany";

interface SendOnMyWayParams {
  jobId: string;
  customerPhone?: string | null;
  customerName?: string | null;
  jobAddress?: string | null;
  employeeName?: string | null;
  employeeId?: string | null;
}

export function useSendOnMyWay() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);

  const send = async ({
    jobId,
    customerPhone,
    customerName,
    employeeName,
    employeeId,
  }: SendOnMyWayParams): Promise<boolean> => {
    if (!customerPhone) {
      toast({
        title: "No customer phone",
        description: "Cannot send OMW without a customer phone number.",
        variant: "destructive",
      });
      return false;
    }

    // ── Status gate ────────────────────────────────────────────────────
    // Only allow OMW from job states where work is still pending or in-flight.
    // Refuse from terminal/inappropriate states so we never text a customer
    // claiming we're on the way for a job that's canceled, done, or invoiced.
    // Also catch double-fires within 2 minutes so a tech tapping twice doesn't
    // double-text the customer.
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("status, on_my_way_sent_at")
      .eq("id", jobId)
      .maybeSingle();

    const jobStatus = (jobRow as any)?.status as string | undefined;
    const blockedStatuses = new Set(["canceled", "done", "invoiced", "completed"]);
    if (jobStatus && blockedStatuses.has(jobStatus)) {
      toast({
        title: "Can't send On My Way",
        description: `This job is ${jobStatus}. Reopen or use a current job before texting the customer.`,
        variant: "destructive",
      });
      return false;
    }

    const lastOmwAt = (jobRow as any)?.on_my_way_sent_at
      ? new Date((jobRow as any).on_my_way_sent_at as string).getTime()
      : 0;
    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    if (lastOmwAt > twoMinAgo) {
      toast({
        title: "On My Way already sent",
        description: "An OMW text just went out within the last 2 minutes. Wait before re-sending.",
        variant: "destructive",
      });
      return false;
    }

    setSending(true);

    try {
      let etaMinutes: number | null = null;

      // Only use the pre-calculated cache. Do not trigger live Maps calls here.
      if (employeeId) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const { data: cacheData, error: cacheError } = await supabase
            .from("route_travel_cache")
            .select("travel_minutes")
            .eq("employee_id", employeeId)
            .eq("scheduled_date", today)
            .eq("to_job_id", jobId)
            .maybeSingle();
          if (cacheError) throw cacheError;
          if (cacheData?.travel_minutes) etaMinutes = cacheData.travel_minutes;
        } catch (error: any) {
          void logClientSystemError({
            sourceName: "on-my-way",
            message: error?.message || "Could not read cached ETA for On My Way SMS",
            severity: "warning",
            context: { job_id: jobId, employee_id: employeeId },
          });
        }
      }

      const companyName = await getJobCompanyName(jobId);
      const body = buildOnMyWaySms({
        customerName,
        techName: employeeName,
        etaMinutes,
        companyName,
      });

      const { sendSmsImpl } = await import("@/hooks/useSendSms");
      const result = await sendSmsImpl({
        to: customerPhone,
        body,
        jobId,
        source: "on_my_way",
        silent: true,
      });

      if (!result.success) {
        toast({ title: "Failed to send", description: result.error, variant: "destructive" });
        return false;
      }

      const now = new Date().toISOString();
      const { error: jobUpdateError } = await supabase.from("jobs").update({
        status: "on_my_way",
        dispatch_sent_at: now,
        on_my_way_sent_at: now,
      } as any).eq("id", jobId);

      if (jobUpdateError) {
        void logClientSystemError({
          sourceName: "on-my-way",
          message: jobUpdateError.message || "On My Way SMS sent, but job status update failed",
          severity: "error",
          context: { job_id: jobId, employee_id: employeeId || null },
        });
        toast({
          title: "Text sent, but job did not update",
          description: "The customer got the message, but dispatch should refresh/check this job.",
          variant: "destructive",
        });
      }

      const { error: activityError } = await supabase.from("activity_log").insert({
        job_id: jobId,
        action: "on_my_way_sent",
        performed_by: employeeName || "Tech",
        details: `On My Way SMS sent to ${customerName || customerPhone}`,
      });

      if (activityError) {
        void logClientSystemError({
          sourceName: "on-my-way",
          message: activityError.message || "On My Way activity log failed",
          severity: "warning",
          context: { job_id: jobId, employee_id: employeeId || null },
        });
      }

      if (employeeId) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: existing, error: existingError } = await supabase
          .from("tech_location_events")
          .select("id")
          .eq("employee_id", employeeId)
          .eq("event_type", "clock_in")
          .gte("created_at", `${today}T00:00:00`)
          .limit(1);

        if (existingError) {
          void logClientSystemError({
            sourceName: "on-my-way",
            message: existingError.message || "Could not check tech clock-in state",
            severity: "warning",
            context: { job_id: jobId, employee_id: employeeId },
          });
        } else if (!existing || existing.length === 0) {
          const { error: clockInError } = await supabase.from("tech_location_events").insert({
            employee_id: employeeId,
            event_type: "clock_in",
            job_id: jobId,
            location_name: `Started day - heading to ${customerName || "job"}`,
          });

          if (clockInError) {
            void logClientSystemError({
              sourceName: "on-my-way",
              message: clockInError.message || "Could not auto clock-in technician",
              severity: "warning",
              context: { job_id: jobId, employee_id: employeeId },
            });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["activity_log"] });
      queryClient.invalidateQueries({ queryKey: ["tech_dashboard_data"] });
      toast({
        title: "On My Way sent!",
        description: etaMinutes
          ? `ETA ${etaMinutes} min sent to ${customerName || customerPhone}`
          : `SMS sent to ${customerName || customerPhone}`,
      });
      return true;
    } finally {
      setSending(false);
    }
  };

  return { send, sending };
}
