import React, { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const TIME_WINDOWS = [
  { label: "Install 9 AM – 5 PM", start: "09:00", end: "17:00" },
  { label: "8 – 10 AM", start: "08:00", end: "10:00" },
  { label: "10 – 12 PM", start: "10:00", end: "12:00" },
  { label: "12 – 2 PM", start: "12:00", end: "14:00" },
  { label: "2 – 4 PM", start: "14:00", end: "16:00" },
  { label: "4 – 6 PM", start: "16:00", end: "18:00" },
];

function getChicagoOffset(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(date);
  const zoneName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT-6";
  const match = zoneName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) return "-06:00";
  const hours = Number(match[1]);
  const minutes = match[2] || "00";
  const sign = hours >= 0 ? "+" : "-";
  return `${sign}${String(Math.abs(hours)).padStart(2, "0")}:${minutes}`;
}

interface RescheduleButtonProps {
  jobId: string;
  jobNumber: string | number | null;
  /** "jobs" or "estimates" table */
  table?: "jobs" | "estimates";
}

export function RescheduleButton({ jobId, jobNumber, table = "jobs" }: RescheduleButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"date" | "time">("date");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setStep("time");
  };

  const handleTimeSelect = async (tw: typeof TIME_WINDOWS[number]) => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const offsetStr = getChicagoOffset(new Date(`${dateStr}T12:00:00Z`));
      const arrivalStart = `${dateStr}T${tw.start}:00${offsetStr}`;
      const arrivalEnd = `${dateStr}T${tw.end}:00${offsetStr}`;
      const { error } = await supabase
        .from(table)
        .update({
          scheduled_date: dateStr,
          arrival_start: arrivalStart,
          arrival_end: arrivalEnd,
          status: "scheduled",
        } as any)
        .eq("id", jobId);
      if (error) throw error;

      await supabase.from("activity_log").insert({
        job_id: table === "jobs" ? jobId : null,
        action: "rescheduled",
        details: `Rescheduled to ${dateStr} ${tw.label}`,
      });

      queryClient.invalidateQueries({ queryKey: [table, jobId] });
      queryClient.invalidateQueries({ queryKey: [table] });
      queryClient.invalidateQueries({ queryKey: ["activity_log"] });

      toast({
        title: "Rescheduled",
        description: `Moved to ${format(selectedDate, "MMM d, yyyy")} ${tw.label}`,
      });

      setOpen(false);
      setStep("date");
      setSelectedDate(undefined);
    } catch (e: any) {
      toast({ title: "Reschedule failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (val: boolean) => {
    setOpen(val);
    if (!val) {
      setStep("date");
      setSelectedDate(undefined);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Reschedule
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {step === "date"
                ? `Reschedule #${jobNumber || "—"}`
                : `Pick Time — ${format(selectedDate!, "MMM d, yyyy")}`}
            </DialogTitle>
          </DialogHeader>

          {step === "date" && (
            <div className="flex justify-center py-2">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                className="pointer-events-auto"
              />
            </div>
          )}

          {step === "time" && (
            <div className="grid gap-2 py-2">
              {TIME_WINDOWS.map((tw, idx) => (
                <React.Fragment key={tw.start + tw.end}>
                  {idx === 1 && (
                    <div className="border-t border-border my-1" />
                  )}
                  <Button
                    variant="outline"
                    disabled={saving}
                    className={cn(
                      "w-full justify-center text-sm h-11 font-medium",
                      idx === 0 && "border-primary/50 bg-primary/5 font-semibold"
                    )}
                    onClick={() => handleTimeSelect(tw)}
                  >
                    {tw.label}
                  </Button>
                </React.Fragment>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground mt-1"
                onClick={() => setStep("date")}
              >
                ← Pick different date
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
