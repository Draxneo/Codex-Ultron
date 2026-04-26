import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmployees } from "@/hooks/useEmployees";
import { useCreateEstimate } from "@/hooks/useEstimates";
import { toast } from "sonner";

const ESTIMATE_TYPES = ["System Replacement", "Service/Repair", "Duct Work Replacement"] as const;
const SYSTEM_TYPES = ["gas_heat", "heat_pump", "dual_fuel", "ac_only"];
const TONNAGES = [1.5, 2, 2.5, 3, 3.5, 4, 5];
const BRANDS = ["Carrier", "Day & Night", "Goodman"];

const ESTIMATE_WINDOWS = [
  { label: "8–10", start: "08:00", end: "10:00" },
  { label: "10–12", start: "10:00", end: "12:00" },
  { label: "12–2", start: "12:00", end: "14:00" },
  { label: "2–4", start: "14:00", end: "16:00" },
  { label: "4–6", start: "16:00", end: "18:00" },
];

interface NewEstimateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When creating a repair estimate from a service job, link it back */
  sourceJobId?: string;
}

export function NewEstimateDialog({ open, onOpenChange, sourceJobId }: NewEstimateDialogProps) {
  const { data: employees } = useEmployees();
  const createEstimate = useCreateEstimate();
  const [estimateType, setEstimateType] = useState<string>("System Replacement");
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    address: "",
    description: "",
    assigned_to: "",
    scheduled_date: "",
    system_type: "",
    tonnage: "",
    brand: "",
    arrival_window: "",
    sale_source: "on_site" as "on_site" | "phone",
  });

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    try {
      // Compute arrival times from window
      let arrival_start: string | null = null;
      let arrival_end: string | null = null;
      if (form.scheduled_date && form.arrival_window) {
        const win = ESTIMATE_WINDOWS.find(w => w.label === form.arrival_window);
        if (win) {
          arrival_start = `${form.scheduled_date}T${win.start}:00`;
          arrival_end = `${form.scheduled_date}T${win.end}:00`;
        }
      }

      await createEstimate.mutateAsync({
        customer_name: form.customer_name,
        customer_phone: form.customer_phone || null,
        customer_email: form.customer_email || null,
        address: form.address || null,
        description: form.description || null,
        assigned_to: form.assigned_to || null,
        scheduled_date: form.scheduled_date || null,
        work_status: form.scheduled_date ? "scheduled" : "new",
        arrival_start,
        arrival_end,
        estimate_type: estimateType === "Service/Repair" ? "service_repair" : estimateType === "Duct Work Replacement" ? "ductwork" : "system_replacement",
        cash_discount_percent: estimateType === "Service/Repair" ? 15 : 0,
        source_job_id: sourceJobId || null,
        options: {
          system_type: form.system_type || null,
          tonnage: form.tonnage ? Number(form.tonnage) : null,
          brand: form.brand || null,
          sale_source: form.sale_source,
        },
      } as any);
      toast.success("Estimate created");
      onOpenChange(false);
      setForm({
        customer_name: "", customer_phone: "", customer_email: "", address: "",
        description: "", assigned_to: "", scheduled_date: "", system_type: "",
        tonnage: "", brand: "", arrival_window: "", sale_source: "on_site",
      });
    } catch {
      toast.error("Failed to create estimate");
    }
  };

  const activeTechs = (employees || []).filter(e => e.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Estimate</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sale Source */}
          <div className="space-y-2">
            <Label>Sale Source</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={form.sale_source === "on_site" ? "default" : "outline"}
                onClick={() => set("sale_source", "on_site")}
              >
                🏠 On-Site Visit
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.sale_source === "phone" ? "default" : "outline"}
                className={form.sale_source === "phone" ? "bg-amber-600 hover:bg-amber-700" : ""}
                onClick={() => set("sale_source", "phone")}
              >
                📞 Phone Sale
              </Button>
            </div>
            {form.sale_source === "phone" && (
              <p className="text-xs text-amber-600">⚠ No site visit — installer will need to capture site data on arrival</p>
            )}
          </div>

          {/* Estimate Type */}
          <div className="space-y-2">
            <Label>Estimate Type</Label>
            <div className="flex gap-2">
              {ESTIMATE_TYPES.map(t => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={estimateType === t ? "default" : "outline"}
                  onClick={() => {
                    setEstimateType(t);
                    if (t === "Service/Repair" || t === "Duct Work Replacement") {
                      setForm(prev => ({ ...prev, system_type: "", tonnage: "", brand: "" }));
                    }
                  }}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {/* Customer Info */}
          <div className="space-y-2">
            <Label>Customer Name *</Label>
            <Input value={form.customer_name} onChange={e => set("customer_name", e.target.value)} placeholder="John Smith" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.customer_phone} onChange={e => set("customer_phone", e.target.value)} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.customer_email} onChange={e => set("customer_email", e.target.value)} placeholder="john@example.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <AddressAutocomplete value={form.address} onChange={(v) => set("address", v)} placeholder="123 Main St, City, ST" />
          </div>

          {/* Assignment */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Assigned Tech</Label>
              <Select value={form.assigned_to} onValueChange={v => set("assigned_to", v)}>
                <SelectTrigger><SelectValue placeholder="Select tech" /></SelectTrigger>
                <SelectContent>
                  {activeTechs.map(emp => (
                    <SelectItem key={emp.id} value={emp.name}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input type="date" value={form.scheduled_date} onChange={e => set("scheduled_date", e.target.value)} />
            </div>
          </div>

          {/* Arrival Window */}
          {form.scheduled_date && (
            <div className="space-y-2">
              <Label>Arrival Window</Label>
              <div className="flex flex-wrap gap-1.5">
                {ESTIMATE_WINDOWS.map(w => (
                  <Button
                    key={w.label}
                    type="button"
                    size="sm"
                    variant={form.arrival_window === w.label ? "default" : "outline"}
                    className="text-xs"
                    onClick={() => set("arrival_window", form.arrival_window === w.label ? "" : w.label)}
                  >
                    {w.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {estimateType === "System Replacement" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System Specs</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">System Type</Label>
                  <div className="flex flex-wrap gap-1">
                    {SYSTEM_TYPES.map(t => (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant={form.system_type === t ? "default" : "outline"}
                        className="text-xs px-2 py-1 h-auto"
                        onClick={() => set("system_type", form.system_type === t ? "" : t)}
                      >
                        {t.replace(/_/g, " ")}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tonnage</Label>
                  <div className="flex flex-wrap gap-1">
                    {TONNAGES.map(t => (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant={form.tonnage === String(t) ? "default" : "outline"}
                        className="text-xs px-2 py-1 h-auto"
                        onClick={() => set("tonnage", form.tonnage === String(t) ? "" : String(t))}
                      >
                        {t}T
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Brand</Label>
                  <div className="flex flex-wrap gap-1">
                    {BRANDS.map(b => (
                      <Button
                        key={b}
                        type="button"
                        size="sm"
                        variant={form.brand === b ? "default" : "outline"}
                        className="text-xs px-2 py-1 h-auto"
                        onClick={() => set("brand", form.brand === b ? "" : b)}
                      >
                        {b}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="Job details, special instructions..." rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createEstimate.isPending}>
            {createEstimate.isPending ? "Creating..." : "Create Estimate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
