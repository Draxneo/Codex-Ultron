/**
 * useSendOnMyWay — Shared hook to send the "On My Way" SMS with computed ETA.
 *
 * Extracted from OnMyWayButton so any UI element (a circle button, a banner,
 * a toolbar action) can trigger the same flow without rendering a secondary
 * button. Handles ETA lookup → SMS send → jobs.on_my_way_sent_at update →
 * activity log → auto clock-in → query invalidation.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { buildOnMyWaySms } from "@/lib/smsCopy";

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
    jobAddress,
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
    setSending(true);

    let etaMinutes: number | null = null;

    // 1. Try pre-calculated route_travel_cache
    if (employeeId) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: cacheData } = await supabase
          .from("route_travel_cache")
          .select("travel_minutes")
          .eq("employee_id", employeeId)
          .eq("scheduled_date", today)
          .eq("to_job_id", jobId)
          .maybeSingle();
        if (cacheData?.travel_minutes) etaMinutes = cacheData.travel_minutes;
      } catch { /* fall through */ }
    }

    // 2. NO live fallback — calling calculate-travel-times here triggered Google Directions
    //    on every OMW press without a cache hit. If route_travel_cache is empty, we send
    //    the OMW SMS without an ETA. This is the cost-control rule: only press-to-Navigate
    //    triggers Maps calls.

    const body = buildOnMyWaySms({
      customerName,
      techName: employeeName,
      etaMinutes,
      companyName: "Carnes and Sons",
    });

    const { sendSmsImpl } = await import("@/hooks/useSendSms");
    const result = await sendSmsImpl({
      to: customerPhone, body, jobId, source: "on_my_way", silent: true,
    });

    if (!result.success) {
      toast({ title: "Failed to send", description: result.error, variant: "destructive" });
      setSending(false);
      return false;
    }

    await supabase.from("jobs").update({
      status: "on_my_way",
      dispatch_sent_at: new Date().toISOString(),
      on_my_way_sent_at: new Date().toISOString(),
    } as any).eq("id", jobId);
    await supabase.from("activity_log").insert({
      job_id: jobId,
      action: "on_my_way_sent",
      performed_by: employeeName || "Tech",
      details: `On My Way SMS sent to ${customerName || customerPhone}`,
    });

    // Auto clock-in (once per day)
    if (employeeId) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabase
        .from("tech_location_events")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("event_type", "clock_in")
        .gte("created_at", `${today}T00:00:00`)
        .limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from("tech_location_events").insert({
          employee_id: employeeId,
          event_type: "clock_in",
          job_id: jobId,
          location_name: `Started day — heading to ${customerName || "job"}`,
        });
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
    setSending(false);
    return true;
  };

  return { send, sending };
}
