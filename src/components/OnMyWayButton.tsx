import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Navigation, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface OnMyWayButtonProps {
  jobId: string;
  customerPhone?: string | null;
  customerName?: string | null;
  jobAddress?: string | null;
  employeeName?: string | null;
  employeeAddress?: string | null;
  employeeId?: string | null;
  alreadySent?: string | null;
  className?: string;
}

export function OnMyWayButton({
  jobId, customerPhone, customerName, jobAddress,
  employeeName, employeeAddress, employeeId, alreadySent, className,
}: OnMyWayButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(!!alreadySent);

  const handleSend = async () => {
    if (!customerPhone) {
      toast({ title: "No customer phone", description: "Cannot send OMW without a customer phone number.", variant: "destructive" });
      return;
    }
    setSending(true);

    let etaMinutes: number | null = null;

    // 1. Try pre-calculated route_travel_cache (most reliable, already computed)
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

        if (cacheData?.travel_minutes) {
          etaMinutes = cacheData.travel_minutes;
        }
      } catch { /* cache lookup failed, fall through */ }
    }

    // 2. Fallback: call server-side calculate-travel-times (uses cached geocode + directions)
    if (etaMinutes === null && jobAddress && employeeName) {
      try {
        const { data } = await supabase.functions.invoke("calculate-travel-times", {
          body: { tech_name: employeeName, proposed_address: jobAddress },
        });
        if (data?.fit_check?.travel_minutes) {
          etaMinutes = data.fit_check.travel_minutes;
        }
      } catch { /* server-side fallback failed */ }
    }

    const etaText = etaMinutes ? ` Estimated arrival: ${etaMinutes} min.` : "";

    const techLabel = employeeName || "Your technician";
    const body = `Hi${customerName ? ` ${customerName.split(" ")[0]}` : ""}, ${techLabel} is on the way!${etaText} See you soon!`;

    const { sendSmsImpl } = await import("@/hooks/useSendSms");
    const result = await sendSmsImpl({
      to: customerPhone, body, jobId, source: "on_my_way", silent: true,
    });
    if (!result.success) {
      toast({ title: "Failed to send", description: result.error, variant: "destructive" });
    } else {
      const { error: updateErr } = await supabase.from("jobs").update({ on_my_way_sent_at: new Date().toISOString() } as any).eq("id", jobId);
      if (updateErr) console.error("OMW: jobs.update failed:", updateErr);
      const { error: logErr } = await supabase.from("activity_log").insert({ job_id: jobId, action: "on_my_way_sent", performed_by: employeeName || "Tech", details: `On My Way SMS sent to ${customerName || customerPhone}` });
      if (logErr) console.error("OMW: activity_log.insert failed:", logErr);

      // Auto clock-in: log clock_in event (once per day)
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
          console.log("[Clock] Auto clock-in logged");
        }
      }

      setSent(true);
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["activity_log"] });
      toast({ title: "On My Way sent!", description: `SMS sent to ${customerName || customerPhone}` });
    }
    setSending(false);
  };

  return (
    <Button
      variant={sent ? "secondary" : "default"}
      size="sm"
      className={className}
      disabled={sending || sent}
      onClick={handleSend}
    >
      {sending ? (
        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Sending...</>
      ) : sent ? (
        <><Check className="h-3.5 w-3.5 mr-1" /> ETA Sent to Customer ✓</>
      ) : (
        <><Navigation className="h-3.5 w-3.5 mr-1" /> Text ETA to Customer</>
      )}
    </Button>
  );
}
