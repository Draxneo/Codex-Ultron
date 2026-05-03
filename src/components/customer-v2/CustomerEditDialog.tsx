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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useUpdateCustomer } from "@/hooks/useCustomers";
import { formatPhoneInput } from "@/lib/formatters";

type CustomerLike = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lead_source?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  notifications_enabled?: boolean | null;
  text_consent?: string | null;
  email_consent?: string | null;
};

function text(value: string | null | undefined) {
  return value ?? "";
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function CustomerEditDialog({ customer }: { customer: CustomerLike }) {
  const updateCustomer = useUpdateCustomer();
  const [open, setOpen] = useState(false);
  const initial = useMemo(
    () => ({
      first_name: text(customer.first_name),
      last_name: text(customer.last_name),
      company: text(customer.company),
      phone: formatPhoneInput(customer.phone),
      mobile_phone: formatPhoneInput(customer.mobile_phone),
      email: text(customer.email),
      address: text(customer.address),
      city: text(customer.city),
      state: text(customer.state),
      zip: text(customer.zip),
      lead_source: text(customer.lead_source),
      tags: (customer.tags || []).join(", "),
      notes: text(customer.notes),
      notifications_enabled: customer.notifications_enabled ?? true,
      text_consent: customer.text_consent || "opted_in",
      email_consent: customer.email_consent || "opted_in",
    }),
    [customer],
  );
  const [form, setForm] = useState(initial);

  const setField = (key: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const reset = () => setForm(initial);

  const save = async () => {
    await updateCustomer.mutateAsync({
      id: customer.id,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company: form.company || null,
      phone: form.phone || null,
      mobile_phone: form.mobile_phone || null,
      email: form.email || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      lead_source: form.lead_source || null,
      tags: parseTags(form.tags),
      notes: form.notes || null,
      notifications_enabled: Boolean(form.notifications_enabled),
      text_consent: form.text_consent || "opted_in",
      email_consent: form.email_consent || "opted_in",
    } as any);
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
          Edit CRM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit customer record</DialogTitle>
          <DialogDescription>
            Update the CRM fields UltraOffice owns directly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="First name" value={form.first_name} onChange={(v) => setField("first_name", v)} />
            <Field label="Last name" value={form.last_name} onChange={(v) => setField("last_name", v)} />
            <Field label="Company" value={form.company} onChange={(v) => setField("company", v)} />
            <Field label="Lead source" value={form.lead_source} onChange={(v) => setField("lead_source", v)} />
            <Field label="Phone" value={form.phone} onChange={(v) => setField("phone", formatPhoneInput(v))} />
            <Field label="Mobile phone" value={form.mobile_phone} onChange={(v) => setField("mobile_phone", formatPhoneInput(v))} />
            <Field label="Email" value={form.email} onChange={(v) => setField("email", v)} />
            <Field label="Tags" value={form.tags} onChange={(v) => setField("tags", v)} placeholder="Comfort Club, Install, VIP" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_80px_120px] gap-3">
            <Field label="Street address" value={form.address} onChange={(v) => setField("address", v)} />
            <Field label="City" value={form.city} onChange={(v) => setField("city", v)} />
            <Field label="State" value={form.state} onChange={(v) => setField("state", v)} />
            <Field label="Zip" value={form.zip} onChange={(v) => setField("zip", v)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="customer-notes">Internal notes</Label>
            <Textarea
              id="customer-notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="notifications-enabled">Notifications</Label>
              <Switch
                id="notifications-enabled"
                checked={Boolean(form.notifications_enabled)}
                onCheckedChange={(v) => setField("notifications_enabled", v)}
              />
            </div>
            <Field label="Text consent" value={form.text_consent} onChange={(v) => setField("text_consent", v)} />
            <Field label="Email consent" value={form.email_consent} onChange={(v) => setField("email_consent", v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateCustomer.isPending}>
            {updateCustomer.isPending ? "Saving..." : "Save customer"}
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
