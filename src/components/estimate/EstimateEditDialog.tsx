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
import { useUpdateEstimate } from "@/hooks/useEstimates";
import { formatPhoneInput } from "@/lib/formatters";

const WORK_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "scheduled", label: "Scheduled" },
  { value: "draft", label: "Drafting" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "canceled", label: "Canceled" },
];

const ESTIMATE_TYPE_OPTIONS = [
  { value: "System Replacement", label: "System Replacement" },
  { value: "Repair", label: "Repair" },
  { value: "Ductwork", label: "Ductwork" },
  { value: "Maintenance", label: "Maintenance" },
  { value: "Other", label: "Other" },
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

export function EstimateEditDialog({ estimate }: { estimate: any }) {
  const updateEstimate = useUpdateEstimate();
  const { data: employees = [] } = useEmployees();
  const [open, setOpen] = useState(false);

  const initial = useMemo(
    () => ({
      assigned_to: estimate?.assigned_to || "__unassigned",
      work_status: estimate?.work_status || estimate?.status || "new",
      estimate_type: estimate?.estimate_type || "System Replacement",
      scheduled_date: text(estimate?.scheduled_date),
      arrival_start: toDateTimeLocal(estimate?.arrival_start),
      arrival_end: toDateTimeLocal(estimate?.arrival_end),
      customer_name: text(estimate?.customer_name),
      customer_phone: formatPhoneInput(estimate?.customer_phone),
      customer_email: text(estimate?.customer_email),
      address: text(estimate?.address),
      description: text(estimate?.description),
    }),
    [estimate],
  );
  const [form, setForm] = useState(initial);

  const activeEmployees = (employees as any[]).filter((employee) => employee.is_active !== false);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const reset = () => setForm(initial);

  const save = async () => {
    const assignedTo = form.assigned_to === "__unassigned" ? null : form.assigned_to;

    await updateEstimate.mutateAsync({
      id: estimate.id,
      updates: {
        assigned_to: assignedTo,
        work_status: form.work_status,
        status: form.work_status,
        estimate_type: form.estimate_type || "Other",
        scheduled_date: form.scheduled_date || null,
        arrival_start: fromDateTimeLocal(form.arrival_start),
        arrival_end: fromDateTimeLocal(form.arrival_end),
        customer_name: form.customer_name || null,
        customer_phone: form.customer_phone || null,
        customer_email: form.customer_email || null,
        address: form.address || null,
        description: form.description || null,
      },
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
          Edit estimate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit estimate</DialogTitle>
          <DialogDescription>
            Update the estimate record owned by UltraOffice.
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
              <Label>Estimate status</Label>
              <Select value={form.work_status} onValueChange={(value) => setField("work_status", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Estimate type</Label>
              <Select value={form.estimate_type} onValueChange={(value) => setField("estimate_type", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTIMATE_TYPE_OPTIONS.map((option) => (
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

          <Field label="Estimate address" value={form.address} onChange={(v) => setField("address", v)} />

          <div className="grid gap-2">
            <Label htmlFor="estimate-description">Description / scope</Label>
            <Textarea
              id="estimate-description"
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              rows={6}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateEstimate.isPending}>
            {updateEstimate.isPending ? "Saving..." : "Save estimate"}
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