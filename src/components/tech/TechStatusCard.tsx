/**
 * TechStatusCard.tsx - compact tech status actions:
 * On My Way · Start · Pause · Finish
 *
 * Wires into our existing data model:
 *   - On My Way → sets jobs.on_my_way_sent_at + sends OMW SMS via useSendOnMyWay
 *   - Start     → sets jobs.started_at + status='in_progress' (or resumes from pause)
 *   - Pause     → sets jobs.status='on_hold', paused_at, optional hold_reason
 *   - Finish    → sets jobs.completed_at (auto-promotes status to 'done')
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Navigation, Play, Check, Pause, FileText, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useSendOnMyWay } from "@/hooks/useSendOnMyWay";
import { sendSmsImpl } from "@/hooks/useSendSms";
import { buildJobCompleteSms } from "@/lib/smsCopy";
import { cn } from "@/lib/utils";

interface TechStatusCardProps {
  jobId: string;
  status: string;
  onMyWaySentAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt?: string | null;
  description: string | null;
  /** Private notes synced from HCP — read-only, displayed in a collapsible section */
  hcpNote?: string | null;
  customerPhone: string | null;
  customerName: string | null;
  jobAddress: string | null;
  employeeName: string | null;
  employeeId: string | null;
}

export function TechStatusCard({
  jobId,
  status,
  onMyWaySentAt,
  startedAt,
  completedAt,
  pausedAt,
  description,
  hcpNote,
  customerPhone,
  customerName,
  jobAddress,
  employeeName,
  employeeId,
}: TechStatusCardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { send: sendOMW, sending: sendingOMW } = useSendOnMyWay();
  const [busy, setBusy] = useState<"start" | "pause" | "finish" | null>(null);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("Waiting on parts");

  // Prefer HCP private notes; fall back to description if HCP didn't sync any
  const notes = (hcpNote && hcpNote.trim()) || (description && description.trim()) || "";
  const [notesOpen, setNotesOpen] = useState(() => Boolean(notes));

  const handleOMW = async () => {
    await sendOMW({ jobId, customerPhone, customerName, jobAddress, employeeName, employeeId });
  };

  const isPaused = status === "on_hold";
  const omwDone = !!onMyWaySentAt;
  const startDone = !!startedAt || ["in_progress", "on_hold", "done", "invoiced"].includes(status);
  const finishDone = !!completedAt || ["done", "invoiced"].includes(status);

  const statusLabel = (() => {
    if (finishDone) return "COMPLETED";
    if (isPaused) return "WAITING ON PARTS";
    if (startDone) return "IN PROGRESS";
    if (omwDone) return "ON MY WAY";
    if (status === "scheduled") return "SCHEDULED";
    return (status || "new").replace(/_/g, " ").toUpperCase();
  })();

  const statusColor = finishDone
    ? "bg-[hsl(var(--complete))] text-white"
    : isPaused
      ? "bg-amber-600 text-white"
      : startDone
        ? "bg-amber-500 text-white"
        : "bg-primary text-primary-foreground";

  const handleStart = async () => {
    setBusy("start");
    const updates: any = isPaused
      ? { status: "in_progress", paused_at: null }
      : { started_at: new Date().toISOString(), status: "in_progress" };
    const { error } = await supabase.from("jobs").update(updates).eq("id", jobId);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("activity_log").insert({
        job_id: jobId,
        action: isPaused ? "job_resumed" : "job_started",
        details: isPaused ? "Tech resumed job" : "Tech started job",
        performed_by: employeeName,
      });
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["tech_dashboard_data"] });
      toast({ title: isPaused ? "Job resumed" : "Job started" });
    }
    setBusy(null);
  };

  const openPauseDialog = () => {
    setPauseReason("Waiting on parts");
    setPauseDialogOpen(true);
  };

  const handlePauseConfirm = async () => {
    const reason = pauseReason.trim() || "Waiting on parts";
    setPauseDialogOpen(false);
    setBusy("pause");
    const { error } = await supabase
      .from("jobs")
      .update({
        status: "on_hold",
        paused_at: new Date().toISOString(),
        hold_reason: reason,
      } as any)
      .eq("id", jobId);
    if (error) {
      toast({ title: "Failed to pause", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("activity_log").insert({
        job_id: jobId,
        action: "job_paused",
        details: `Tech paused job — ${reason}`,
        performed_by: employeeName,
      });
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["tech_dashboard_data"] });
      toast({ title: "Job paused", description: reason });
    }
    setBusy(null);
  };

  const handleFinish = async () => {
    setBusy("finish");
    const { error } = await supabase
      .from("jobs")
      .update({ status: "done", completed_at: new Date().toISOString() } as any)
      .eq("id", jobId);
    if (error) {
      toast({ title: "Failed to finish", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("activity_log").insert({ job_id: jobId, action: "job_finished", details: "Tech finished job", performed_by: employeeName });
      if (customerPhone) {
        const sms = await sendSmsImpl({
          to: customerPhone,
          body: buildJobCompleteSms({ customerName, companyName: "Carnes and Sons" }),
          jobId,
          contactName: customerName || null,
          contactType: "customer",
          source: "job_complete",
          hitlApproved: true,
          silent: true,
        });
        await supabase.from("activity_log").insert({
          job_id: jobId,
          action: sms.success ? "job_complete_sms_sent" : "job_complete_sms_failed",
          details: sms.success
            ? `Completion SMS sent to ${customerName || customerPhone}`
            : `Completion SMS failed for ${customerName || customerPhone}: ${sms.error || "unknown error"}`,
          performed_by: employeeName,
        });
      }
      qc.invalidateQueries({ queryKey: ["jobs", jobId] });
      qc.invalidateQueries({ queryKey: ["tech_dashboard_data"] });
      toast({ title: "Job finished" });
    }
    setBusy(null);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex justify-end p-3 pb-0">
        <Badge className={cn("font-bold text-[10px] tracking-wider px-2.5 py-1", statusColor)}>{statusLabel}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 py-3">
        <StatusActionButton
          icon={Navigation}
          label="On My Way"
          done={omwDone}
          onClick={!omwDone ? handleOMW : undefined}
          loading={sendingOMW}
          timestamp={onMyWaySentAt}
        />
        <StatusActionButton
          icon={Play}
          label={isPaused ? "Resume" : "Start"}
          done={startDone && !isPaused}
          onClick={!startDone || isPaused ? handleStart : undefined}
          loading={busy === "start"}
          timestamp={startedAt}
        />
        <StatusActionButton
          icon={Pause}
          label="Pause"
          done={false}
          paused={isPaused}
          onClick={startDone && !finishDone && !isPaused ? openPauseDialog : undefined}
          loading={busy === "pause"}
          disabled={!startDone || finishDone}
          timestamp={isPaused ? pausedAt || null : null}
        />
        <StatusActionButton
          icon={Check}
          label="Finish"
          done={finishDone}
          onClick={!finishDone && startDone && !isPaused ? handleFinish : undefined}
          loading={busy === "finish"}
          disabled={!startDone || isPaused}
          timestamp={completedAt}
        />
      </div>

      {/* Work notes — collapsible, read-only sync from Housecall Pro */}
      {notes && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setNotesOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-4 h-11 text-left active:bg-muted/50"
            aria-expanded={notesOpen}
          >
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Work Notes
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform ml-auto",
                notesOpen ? "rotate-0" : "-rotate-90",
              )}
            />
          </button>
          {notesOpen && (
            <div className="px-4 pb-3 -mt-1">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{notes}</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pause job</DialogTitle>
            <DialogDescription>Reason</DialogDescription>
          </DialogHeader>
          <Input
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            placeholder="Waiting on parts"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePauseConfirm();
            }}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPauseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePauseConfirm}>Pause job</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface StatusActionButtonProps {
  icon: typeof Navigation;
  label: string;
  done: boolean;
  paused?: boolean;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  timestamp?: string | null;
}

function StatusActionButton({ icon: Icon, label, done, paused, onClick, loading, disabled, timestamp }: StatusActionButtonProps) {
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading || (!onClick && !done && !paused)}
      className={cn(
        "flex min-h-[58px] items-center gap-2 rounded-lg border p-3 text-left transition active:scale-[0.98]",
        done && "border-[hsl(var(--complete))]/50 bg-[hsl(var(--complete))]/10 text-[hsl(var(--complete))]",
        paused && "border-amber-500/60 bg-amber-500/10 text-amber-600 animate-pulse",
        !done && !paused && disabled && "border-border bg-muted/40 text-muted-foreground/50",
        !done && !paused && !disabled && "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70">
        {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-tight text-foreground">{label}</span>
        {loading || time ? (
          <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
            {loading ? "..." : time}
          </span>
        ) : null}
      </span>
    </button>
  );
}
