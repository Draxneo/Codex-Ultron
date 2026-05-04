import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEmployees } from "@/hooks/useEmployees";
import { useUpdateJob } from "@/hooks/useJobs";
import { formatPhoneInput } from "@/lib/formatters";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "scheduled", label: "Scheduled" },
  { value: "on_my_way", label: "On my way" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

const TYPE_OPTIONS = [
  { value: "service", label: "Service" },
  { value: "maintenance", label: "Maintenance" },
  { value: "install", label: "Install" },
  { value: "estimate", label: "Estimate" },
  { value: "repair", label: "Repair" },
];

function text(value: string | null | undefined) {
  return value ?? "";
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateTimeLocal(value: string) {
  return value ? `${value}:00` : null;
}

export function JobEditDialog({ job }: { job: any }) {
  const updateJob = useUpdateJob();
  const { data: employees = [] } = useEmployees();
  const [open, setOpen] = useState(false);

  const initial = useMemo(
    () => ({
      assigned_to: job?.assigned_to || "__unassigned",
      status: job?.status || "new",
      job_type: job?.job_type || "service",
      scheduled_date: text(job?.scheduled_date),
      arrival_start: toDateTimeLocal(job?.arrival_start),
      arrival_end: toDateTimeLocal(job?.arrival_end),
      customer_name: text(job?.customer_name),
      customer_phone: formatPhoneInput(job?.customer_phone),
      customer_email: text(job?.customer_email),
      address: text(job?.address),
      description: text(job?.description),
      hold_reason: text(job?.hold_reason),
    }),
    [job],
  );
  const [form, setForm] = useState(initial);

  const activeEmployees = (employees as any[]).filter((employee) => employee.is_active !== false);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const reset = () => setForm(initial);

  const save = async () => {
    const assignedTo = form.assigned_to === "__unassigned" ? null : form.assigned_to;
    const changes: string[] = [];
    if ((job?.assigned_to || null) !== assignedTo) {
      changes.push(`Assigned to ${assignedTo || "Unassigned"}`);
    }
    if ((job?.status || "new") !== form.status) changes.push(`Status set to ${form.status}`);
    if ((job?.scheduled_date || "") !== form.scheduled_date) changes.push(`Scheduled for ${form.scheduled_date || "unscheduled"}`);

    await updateJob.mutateAsync({
      id: job.id,
      updates: {
        assigned_to: assignedTo,
        status: form.status,
        job_type: form.job_type || null,
        scheduled_date: form.scheduled_date || null,
        arrival_start: fromDateTimeLocal(form.arrival_start),
        arrival_end: fromDateTimeLocal(form.arrival_end),
        customer_name: form.customer_name || null,
        customer_phone: form.customer_phone || null,
        customer_email: form.customer_email || null,
        address: form.address || null,
        description: form.description || null,
        hold_reason: form.hold_reason || null,
      },
      activityDetails: changes.length ? changes.join("; ") : "Job details edited",
    });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Pencil className="h-4 w-4" />
          Edit job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit job</DialogTitle>
          <DialogDescription>
            Reassign, reschedule, and update the job record owned by UltraOffice.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Assigned tech</Label>
              <Select value={form.assigned_to} onValueChange={(value) => setField("assigned_to", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                  {activeEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.name}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setField("status", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Job type</Label>
              <Select value={form.job_type} onValueChange={(value) => setField("job_type", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field type="date" label="Scheduled date" value={form.scheduled_date} onChange={(v) => setField("scheduled_date", v)} />
            <Field type="datetime-local" label="Arrival start" value={form.arrival_start} onChange={(v) => setField("arrival_start", v)} />
            <Field type="datetime-local" label="Arrival end" value={form.arrival_end} onChange={(v) => setField("arrival_end", v)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Customer name" value={form.customer_name} onChange={(v) => setField("customer_name", v)} />
            <Field label="Phone" value={form.customer_phone} onChange={(v) => setField("customer_phone", formatPhoneInput(v))} />
            <Field label="Email" value={form.customer_email} onChange={(v) => setField("customer_email", v)} />
          </div>

          <Field label="Job address" value={form.address} onChange={(v) => setField("address", v)} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="job-description">Description / scope</Label>
              <Textarea
                id="job-description"
                value={form.description}
                onChange={(event) => setField("description", event.target.value)}
                rows={5}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hold-reason">Hold reason</Label>
              <Textarea
                id="hold-reason"
                value={form.hold_reason}
                onChange={(event) => setField("hold_reason", event.target.value)}
                rows={5}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateJob.isPending}>
            {updateJob.isPending ? "Saving..." : "Save job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}