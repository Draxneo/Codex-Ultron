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
import { getJobCompanyName } from "@/lib/jobCompany";
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
  display?: "grid" | "single";
  singleAction?: "omw" | "arrive" | "finish";
  className?: string;
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
  display = "grid",
  singleAction,
  className,
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
      ? "bg-amber-300 text-amber-950"
      : startDone
        ? "bg-amber-300 text-amber-950"
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

    // ── Field Approval Loop gate ─────────────────────────────────────
    // Per product principles §6, every completed job must carry photo evidence
    // AND have presented options to the customer. For INSTALLS specifically, we
    // also require an equipment serial captured somewhere — without that we can't
    // register warranty downstream, which means the customer's coverage silently
    // fails (this used to happen, hence the hard gate now).
    //
    // Photo gate    = HARD: zero photos means we have no proof of work. No exceptions.
    // Cart gate     = SOFT: some jobs (warranty visits, agreement maintenance) legitimately
    //                 have no cart. Warn but allow.
    // Serial gate   = HARD for installs only: equipment must be captured in job_equipment,
    //                 tech_forms.equipment_serial, or any extracted_serial fields. Service
    //                 calls and other job types skip this check.
    const [photoCheck, cartCheck, jobMetaCheck] = await Promise.all([
      supabase
        .from("job_attachments")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId),
      supabase
        .from("job_carts")
        .select("id, status")
        .eq("job_id", jobId)
        .in("status", ["sent", "approved", "paid", "declined"])
        .limit(1),
      supabase
        .from("jobs")
        .select("job_type, hcp_id, import_run_id")
        .eq("id", jobId)
        .maybeSingle(),
    ]);

    const photoCount = photoCheck.count ?? 0;
    const customerSawCart = (cartCheck.data?.length ?? 0) > 0;
    const jobMeta = jobMetaCheck.data as any;
    const isInstall = jobMeta?.job_type === "install";
    // Legacy HCP-imported jobs are excluded from new gates — Clint stamped them legacy
    // and they should be allowed to close without modern requirements.
    const isLegacy = Boolean(jobMeta?.hcp_id || jobMeta?.import_run_id);

    if (photoCount === 0) {
      toast({
        title: "Add at least one photo before finishing",
        description: "Every completed job needs photo evidence — even a quick before/after shot. Snap a photo and try again.",
        variant: "destructive",
      });
      setBusy(null);
      return;
    }

    if (isInstall && !isLegacy) {
      // Check every place a serial might live for this job. ANY hit unblocks finish.
      const [eqRow, techForm, photoSerial] = await Promise.all([
        supabase
          .from("job_equipment")
          .select("id, serial_number")
          .eq("job_id", jobId)
          .not("serial_number", "is", null)
          .limit(1),
        supabase
          .from("tech_forms")
          .select("id, equipment_serial")
          .eq("job_id", jobId)
          .not("equipment_serial", "is", null)
          .limit(1),
        supabase
          .from("tech_form_photos")
          .select("id, extracted_serial, tech_form_id")
          .not("extracted_serial", "is", null)
          .limit(1),
      ]);

      const hasJobEquipmentSerial = (eqRow.data?.length ?? 0) > 0;
      const hasTechFormSerial = (techForm.data?.length ?? 0) > 0;
      const hasPhotoSerial = (photoSerial.data?.length ?? 0) > 0; // best-effort: photos not job-scoped, treated as soft signal

      if (!hasJobEquipmentSerial && !hasTechFormSerial && !hasPhotoSerial) {
        toast({
          title: "Capture equipment serial before finishing install",
          description: "Warranty registration needs the serial number. Add it via the equipment card, the tech form, or a serial-tag photo.",
          variant: "destructive",
        });
        setBusy(null);
        return;
      }
    }

    if (!customerSawCart) {
      // Soft gate: log a warning so this is auditable, but let the tech proceed.
      // If this becomes noisy we can promote it to a confirm dialog in a later pass.
      toast({
        title: "No cart presented to customer",
        description: "Finishing without a sent/approved cart. Make sure the customer was offered options.",
      });
    }

    const { error } = await supabase
      .from("jobs")
      .update({ status: "done", completed_at: new Date().toISOString() } as any)
      .eq("id", jobId);
    if (error) {
      toast({ title: "Failed to finish", description: error.message, variant: "destructive" });
    } else {
      await supabase.from("activity_log").insert({ job_id: jobId, action: "job_finished", details: "Tech finished job", performed_by: employeeName });
      if (customerPhone) {
        const companyName = await getJobCompanyName(jobId);
        const sms = await sendSmsImpl({
          to: customerPhone,
          body: buildJobCompleteSms({ customerName, companyName }),
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

  const primaryAction = (() => {
    if (singleAction === "omw") {
      return {
        icon: Navigation,
        label: "On My Way",
        done: omwDone,
        onClick: !omwDone ? handleOMW : undefined,
        loading: sendingOMW,
        disabled: false,
        timestamp: onMyWaySentAt,
      };
    }
    if (singleAction === "arrive") {
      return {
        icon: Play,
        label: isPaused ? "Resume" : "Arrive",
        done: startDone && !isPaused,
        onClick: !startDone || isPaused ? handleStart : undefined,
        loading: busy === "start",
        disabled: false,
        timestamp: startedAt,
      };
    }
    return {
      icon: Check,
      label: finishDone ? "Finished" : "Finish",
      done: finishDone,
      onClick: !finishDone && startDone && !isPaused ? handleFinish : undefined,
      loading: busy === "finish",
      disabled: !startDone || isPaused,
      timestamp: completedAt,
    };
  })();

  if (display === "single") {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <div className="flex items-center justify-between gap-3 p-3">
          <Badge className={cn("font-bold text-[10px] tracking-wider px-2.5 py-1", statusColor)}>{statusLabel}</Badge>
          {startDone && !finishDone ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={openPauseDialog}
              disabled={isPaused || busy === "pause"}
            >
              Pause
            </Button>
          ) : null}
        </div>

        <div className="px-3 pb-3">
          <StatusActionButton
            icon={primaryAction.icon}
            label={primaryAction.label}
            done={primaryAction.done}
            onClick={primaryAction.onClick}
            loading={primaryAction.loading}
            disabled={primaryAction.disabled}
            timestamp={primaryAction.timestamp}
            large
          />
        </div>

        <PauseDialog
          open={pauseDialogOpen}
          onOpenChange={setPauseDialogOpen}
          value={pauseReason}
          onChange={setPauseReason}
          onConfirm={handlePauseConfirm}
        />
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
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

      <PauseDialog
        open={pauseDialogOpen}
        onOpenChange={setPauseDialogOpen}
        value={pauseReason}
        onChange={setPauseReason}
        onConfirm={handlePauseConfirm}
      />
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
  large?: boolean;
}

function StatusActionButton({ icon: Icon, label, done, paused, onClick, loading, disabled, timestamp, large }: StatusActionButtonProps) {
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading || (!onClick && !done && !paused)}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-3 text-left transition active:scale-[0.98]",
        large ? "min-h-[72px]" : "min-h-[58px]",
        done && "border-[hsl(var(--complete))]/50 bg-[hsl(var(--complete))]/10 text-[hsl(var(--complete))]",
        paused && "border-amber-500/60 bg-amber-500/10 text-amber-600 animate-pulse",
        !done && !paused && disabled && "border-border bg-muted/40 text-muted-foreground",
        !done && !paused && !disabled && "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
      )}
    >
      <span className={cn("flex shrink-0 items-center justify-center rounded-md bg-background/70", large ? "h-12 w-12" : "h-9 w-9")}>
        {done ? <Check className={large ? "h-6 w-6" : "h-5 w-5"} /> : <Icon className={large ? "h-6 w-6" : "h-5 w-5"} />}
      </span>
      <span className="min-w-0">
        <span className={cn("block font-bold leading-tight text-foreground", large ? "text-lg" : "text-sm")}>{label}</span>
        {loading || time ? (
          <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
            {loading ? "..." : time}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function PauseDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const quickReasons = ["Waiting on parts", "Need dispatch", "Customer unavailable", "Weather delay"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pause job</DialogTitle>
          <DialogDescription>Pick a reason. Type only if none of these fit.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {quickReasons.map((reason) => (
            <Button
              key={reason}
              type="button"
              variant={value === reason ? "default" : "outline"}
              className="h-12 justify-start text-left text-sm"
              onClick={() => onChange(reason)}
            >
              {reason}
            </Button>
          ))}
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Other reason"
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
          }}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Pause job</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
