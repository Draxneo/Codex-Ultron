/**
 * TechStatusCard.tsx - Tech status card with 4 big circles:
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
  const [notesOpen, setNotesOpen] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("Waiting on parts");

  // Prefer HCP private notes; fall back to description if HCP didn't sync any
  const notes = (hcpNote && hcpNote.trim()) || (description && description.trim()) || "";

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
      .update({ completed_at: new Date().toISOString() } as any)
      .eq("id", jobId);
    if (error) {
      toast({ title: "Failed to finish", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("activity_log").insert({ job_id: jobId, action: "job_finished", details: "Tech finished job", performed_by: employeeName });
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

      {/* 4 big status circles */}
      <div className="grid grid-cols-4 gap-2 px-3 py-5">
        <StatusCircle
          icon={Navigation}
          label="On My Way"
          done={omwDone}
          onClick={!omwDone ? handleOMW : undefined}
          loading={sendingOMW}
          timestamp={onMyWaySentAt}
        />
        <StatusCircle
          icon={Play}
          label={isPaused ? "Resume" : "Start"}
          done={startDone && !isPaused}
          onClick={!startDone || isPaused ? handleStart : undefined}
          loading={busy === "start"}
          timestamp={startedAt}
        />
        <StatusCircle
          icon={Pause}
          label="Pause"
          done={false}
          paused={isPaused}
          onClick={startDone && !finishDone && !isPaused ? openPauseDialog : undefined}
          loading={busy === "pause"}
          disabled={!startDone || finishDone}
          timestamp={isPaused ? pausedAt || null : null}
        />
        <StatusCircle
          icon={Check}
          label="Finish"
          done={finishDone}
          onClick={!finishDone && startDone && !isPaused ? handleFinish : undefined}
          loading={busy === "finish"}
          disabled={!startDone || isPaused}
          timestamp={completedAt}
        />
      </div>

      {/* HCP Private Notes — collapsible, read-only sync from Housecall Pro */}
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
              HCP Private Notes
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
            <DialogDescription>What's holding you up? This shows on the dispatch board.</DialogDescription>
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

interface StatusCircleProps {
  icon: typeof Navigation;
  label: string;
  done: boolean;
  paused?: boolean;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  timestamp?: string | null;
}

function StatusCircle({ icon: Icon, label, done, paused, onClick, loading, disabled, timestamp }: StatusCircleProps) {
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading || (!onClick && !done && !paused)}
        className={cn(
          "h-16 w-16 rounded-full flex items-center justify-center border-2 transition-all",
          done && "bg-[hsl(var(--complete))]/15 border-[hsl(var(--complete))] text-[hsl(var(--complete))]",
          paused && "bg-amber-500/15 border-amber-500 text-amber-600 animate-pulse",
          !done && !paused && disabled && "bg-muted border-border text-muted-foreground/40",
          !done && !paused && !disabled && "bg-primary/10 border-primary text-primary active:scale-95",
        )}
      >
        {done ? <Check className="h-7 w-7" /> : <Icon className="h-6 w-6" />}
      </button>
      <span className="min-h-[28px] text-center text-[11px] font-semibold leading-tight text-foreground">{label}</span>
      {time && <span className="text-[10px] text-muted-foreground">{time}</span>}
    </div>
  );
}
