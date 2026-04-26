import { Card } from "@/components/ui/card";
import { Calendar, Truck, Play, CheckCircle2, FileText, CreditCard, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSendOnMyWay } from "@/hooks/useSendOnMyWay";

interface Props {
  job: any;
  jobId: string;
  onInvoiceClick?: () => void;
}

interface ActionButtonProps {
  icon: React.ElementType;
  label: string;
  sublabel?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
}

function ActionButton({ icon: Icon, label, sublabel, onClick, active, disabled, busy }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "flex-1 min-w-[110px] flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-md border transition-colors",
        "hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed",
        active ? "border-primary bg-primary/5 text-primary" : "border-border bg-background"
      )}
    >
      <Icon className={cn("h-5 w-5", active && "text-primary")} />
      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      {sublabel && <span className="text-[10px] text-muted-foreground leading-tight text-center">{sublabel}</span>}
    </button>
  );
}

export function JobV2ActionBar({ job, jobId, onInvoiceClick }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const { send: sendOMW, sending: sendingOMW } = useSendOnMyWay();

  const setStatus = async (newStatus: string, action: string) => {
    setBusy(action);
    try {
      const updates: any = { status: newStatus };
      if (newStatus === "in_progress") updates.started_at = new Date().toISOString();
      if (newStatus === "done") updates.completed_at = new Date().toISOString();
      await supabase.from("jobs").update(updates).eq("id", jobId);
      await supabase.from("activity_log").insert({ job_id: jobId, action, details: `Status → ${newStatus}` });
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["activity_log"] });
      toast({ title: action.replace(/_/g, " ") });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const scheduleSub = job?.scheduled_date
    ? `${format(new Date(job.scheduled_date + "T00:00:00"), "MMM d")}${job.scheduled_time ? ` · ${job.scheduled_time}` : ""}`
    : "Not scheduled";

  const status = job?.status || "new";
  const isOmw = status === "on_my_way";
  const isStarted = status === "in_progress" || status === "started";
  const isDone = status === "done" || status === "completed" || Boolean(job?.completed_at);

  return (
    <Card className="p-3">
      <div className="flex flex-wrap gap-2">
        <ActionButton
          icon={Calendar}
          label="Schedule"
          sublabel={scheduleSub}
          active={!!job?.scheduled_date}
        />
        <ActionButton
          icon={Truck}
          label="OMW"
          onClick={() => sendOMW({
            jobId,
            customerPhone: job?.customer_phone,
            customerName: job?.customer_name,
            jobAddress: job?.address,
            employeeName: job?.assigned_to,
            employeeId: job?.assigned_employee_id || job?.employee_id || null,
          })}
          active={isOmw}
          busy={sendingOMW}
        />
        <ActionButton
          icon={Play}
          label="Start"
          onClick={() => setStatus("in_progress", "job_started")}
          active={isStarted}
          busy={busy === "job_started"}
        />
        <ActionButton
          icon={CheckCircle2}
          label="Finish"
          onClick={() => setStatus("done", "job_finished")}
          active={isDone}
          busy={busy === "job_finished"}
        />
        <ActionButton
          icon={FileText}
          label="Invoice"
          onClick={onInvoiceClick}
        />
        <ActionButton
          icon={CreditCard}
          label="Pay"
          onClick={onInvoiceClick}
        />
        <ActionButton
          icon={Zap}
          label="Quick Quote"
          sublabel="Send & approve"
          onClick={() => {
            const params = new URLSearchParams({
              job_id: jobId,
              ...(job?.customer_name ? { customer_name: job.customer_name } : {}),
              ...(job?.customer_phone ? { customer_phone: job.customer_phone } : {}),
              ...(job?.customer_email ? { customer_email: job.customer_email } : {}),
            });
            navigate(`/quick-quote?${params.toString()}`);
          }}
        />
      </div>
    </Card>
  );
}
