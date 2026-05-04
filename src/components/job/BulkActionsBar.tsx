import React, { useState } from "react";
import { X, CalendarClock, UserRoundPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface SelectedItem {
  id: string;
  item_type: "job" | "estimate";
  customer_name: string | null;
  job_number?: string | null;
  hcp_job_number?: string | null;
  estimate_number?: string | null;
}

interface BulkActionsBarProps {
  selectedItems: SelectedItem[];
  totalItems: number;
  employees: any[] | undefined;
  onClose: () => void;
  onClearSelection: () => void;
}

export function BulkActionsBar({ selectedItems, totalItems, employees, onClose, onClearSelection }: BulkActionsBarProps) {
  const queryClient = useQueryClient();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [step, setStep] = useState<"date" | "time">("date");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");

  const count = selectedItems.length;

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setStep("time");
  };

  const handleBulkReschedule = async (tw: typeof TIME_WINDOWS[number]) => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const offsetStr = "-05:00";
      const arrivalStart = `${dateStr}T${tw.start}:00${offsetStr}`;
      const arrivalEnd = `${dateStr}T${tw.end}:00${offsetStr}`;

      const jobs = selectedItems.filter(i => i.item_type === "job");
      const estimates = selectedItems.filter(i => i.item_type === "estimate");

      if (jobs.length) {
        const { error } = await supabase
          .from("jobs")
          .update({ scheduled_date: dateStr, arrival_start: arrivalStart, arrival_end: arrivalEnd, status: "scheduled" } as any)
          .in("id", jobs.map(j => j.id));
        if (error) throw error;
      }
      if (estimates.length) {
        const { error } = await supabase
          .from("estimates")
          .update({ scheduled_date: dateStr, arrival_start: arrivalStart, arrival_end: arrivalEnd, status: "scheduled" } as any)
          .in("id", estimates.map(e => e.id));
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });

      toast({
        title: `${count} items rescheduled`,
        description: `Moved to ${format(selectedDate, "MMM d, yyyy")} ${tw.label}`,
      });

      setRescheduleOpen(false);
      setStep("date");
      setSelectedDate(undefined);
      onClearSelection();
    } catch (e: any) {
      toast({ title: "Bulk reschedule failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!selectedEmployee) return;
    setSaving(true);
    try {
      const emp = (employees || []).find((e: any) => e.id === selectedEmployee);
      const empName = emp?.name || "";

      const jobs = selectedItems.filter(i => i.item_type === "job");
      const estimates = selectedItems.filter(i => i.item_type === "estimate");

      if (jobs.length) {
        const { error } = await supabase
          .from("jobs")
          .update({ assigned_to: empName } as any)
          .in("id", jobs.map(j => j.id));
        if (error) throw error;
      }
      if (estimates.length) {
        const { error } = await supabase
          .from("estimates")
          .update({ assigned_to: empName } as any)
          .in("id", estimates.map(e => e.id));
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });

      toast({
        title: `${count} items reassigned`,
        description: `Assigned to ${empName}`,
      });

      setAssignOpen(false);
      setSelectedEmployee("");
      onClearSelection();
    } catch (e: any) {
      toast({ title: "Bulk assign failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Sticky bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/50">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {count}/{totalItems} calendar items selected
        </span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={count === 0}
          onClick={() => setAssignOpen(true)}
        >
          <UserRoundPen className="h-3.5 w-3.5" />
          Edit assignees
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={count === 0}
          onClick={() => { setStep("date"); setRescheduleOpen(true); }}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Reschedule
        </Button>
      </div>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={(v) => { setRescheduleOpen(v); if (!v) { setStep("date"); setSelectedDate(undefined); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {step === "date"
                ? `Reschedule ${count} item${count !== 1 ? "s" : ""}`
                : `Pick Time — ${format(selectedDate!, "MMM d, yyyy")}`}
            </DialogTitle>
          </DialogHeader>
          {step === "date" && (
            <div className="flex justify-center py-2">
              <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} className="pointer-events-auto" />
            </div>
          )}
          {step === "time" && (
            <div className="grid gap-2 py-2">
              {TIME_WINDOWS.map((tw, idx) => (
                <React.Fragment key={tw.start + tw.end}>
                  {idx === 1 && <div className="border-t border-border my-1" />}
                  <Button
                    variant="outline"
                    disabled={saving}
                    className={cn("w-full justify-center text-sm h-11 font-medium", idx === 0 && "border-primary/50 bg-primary/5 font-semibold")}
                    onClick={() => handleBulkReschedule(tw)}
                  >
                    {tw.label}
                  </Button>
                </React.Fragment>
              ))}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground mt-1" onClick={() => setStep("date")}>
                ← Pick different date
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              Reassign {count} item{count !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Select technician..." />
              </SelectTrigger>
              <SelectContent>
                {(employees || []).map((emp: any) => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" disabled={!selectedEmployee || saving} onClick={handleBulkAssign}>
              {saving ? "Saving..." : `Assign ${count} item${count !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
