import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import type { SequenceStep } from "@/hooks/useMessageSequences";

interface Props {
  step: SequenceStep | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: SequenceStep) => void;
  onDelete: (id: string) => void;
}

export function SequenceNodeDetail({ step, open, onClose, onSave, onDelete }: Props) {
  const [label, setLabel] = useState("");
  const [config, setConfig] = useState<Record<string, any>>({});

  useEffect(() => {
    if (step) {
      setLabel(step.label);
      setConfig({ ...step.config });
    }
  }, [step]);

  if (!step) return null;

  const handleSave = () => {
    onSave({ ...step, label, config });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{step.type.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          {step.type === "trigger" && (
            <div className="space-y-1">
              <Label className="text-xs">Trigger Event</Label>
              <Select value={config.event || "job_completed"} onValueChange={(v) => setConfig(c => ({ ...c, event: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="job_completed">Job Completed</SelectItem>
                  <SelectItem value="estimate_sent">Estimate Sent</SelectItem>
                  <SelectItem value="invoice_overdue">Invoice Overdue</SelectItem>
                  <SelectItem value="new_lead">New Lead</SelectItem>
                  <SelectItem value="maintenance_due">Maintenance Due</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {step.type === "delay" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Duration</Label>
                <Input type="number" value={config.duration || 1} onChange={(e) => setConfig(c => ({ ...c, duration: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Select value={config.unit || "hours"} onValueChange={(v) => setConfig(c => ({ ...c, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(step.type === "send_sms" || step.type === "send_email") && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Template Name</Label>
                <Input value={config.templateName || ""} onChange={(e) => setConfig(c => ({ ...c, templateName: e.target.value }))} placeholder="e.g. Follow-up Thank You" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Message Body</Label>
                <Textarea value={config.body || ""} onChange={(e) => setConfig(c => ({ ...c, body: e.target.value }))} rows={4} placeholder="Hi {{first_name}},..." />
              </div>
            </>
          )}

          {step.type === "ai_check" && (
            <div className="space-y-1">
              <Label className="text-xs">AI Action</Label>
              <Select value={config.action || "parse_reply"} onValueChange={(v) => setConfig(c => ({ ...c, action: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parse_reply">Parse Customer Reply</SelectItem>
                  <SelectItem value="sentiment">Sentiment Analysis</SelectItem>
                  <SelectItem value="escalate">Escalate to Human</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {step.type === "branch" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <Input value={config.condition || ""} onChange={(e) => setConfig(c => ({ ...c, condition: e.target.value }))} placeholder="e.g. reply_received == true" />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} className="flex-1">Save</Button>
            {step.type !== "trigger" && (
              <Button variant="destructive" size="icon" onClick={() => { onDelete(step.id); onClose(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
