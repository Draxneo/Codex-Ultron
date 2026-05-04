import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomers, type Customer } from "@/hooks/useCustomers";
import { useEmployees } from "@/hooks/useEmployees";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { getCustomerAgreementDiscount } from "@/hooks/useServiceAgreements";
import { supabase } from "@/integrations/supabase/client";
import { formatJobData } from "@/lib/formatters";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Search, AlertTriangle, ShieldCheck, Sparkles, Crown } from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Checkbox } from "@/components/ui/checkbox";

const JOB_TYPES = [
  { value: "install", label: "Install" },
  { value: "service", label: "Service" },
  { value: "maintenance", label: "Maintenance" },
  { value: "phone_call", label: "Phone Call" },
];

const SERVICE_WINDOWS = [
  { label: "8–10", start: "08:00", end: "10:00" },
  { label: "10–12", start: "10:00", end: "12:00" },
  { label: "12–2", start: "12:00", end: "14:00" },
  { label: "2–4", start: "14:00", end: "16:00" },
  { label: "4–6", start: "16:00", end: "18:00" },
];

const INSTALL_WINDOW = { label: "8am–5pm", start: "08:00", end: "17:00" };

export function NewJobDialog({ open, onOpenChange, defaultDate }: { open: boolean; onOpenChange: (open: boolean) => void; defaultDate?: string }) {
  const qc = useQueryClient();
  const [custSearch, setCustSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [jobType, setJobType] = useState("service");
  const [season, setSeason] = useState("");
  const [scheduledDate, setScheduledDate] = useState(defaultDate || "");
  const [assignedTo, setAssignedTo] = useState("");
  const [additionalTeam, setAdditionalTeam] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [arrivalWindow, setArrivalWindow] = useState("");
  const [feeAcknowledged, setFeeAcknowledged] = useState(false);
  const [agreementInfo, setAgreementInfo] = useState<{ hasAgreement: true; discountPercent: number; planName: string; perks: string[] } | { hasAgreement: false; perks: string[] } | null>(null);
  const { settings } = useCompanySettings();
  const emergencyFee = settings.emergency_fee || "$99";

  // Auto-detect service agreement when customer + maintenance selected
  useEffect(() => {
    if (!selectedCustomer || jobType !== "maintenance") {
      setAgreementInfo(null);
      return;
    }
    getCustomerAgreementDiscount(selectedCustomer.id).then(setAgreementInfo);
  }, [selectedCustomer, jobType]);

  // Sync defaultDate when dialog opens with a new date
  const [lastDefault, setLastDefault] = useState(defaultDate);
  if (defaultDate !== lastDefault) {
    setLastDefault(defaultDate);
    if (defaultDate) setScheduledDate(defaultDate);
  }

  const { data: customers } = useCustomers(custSearch);
  const { data: employees } = useEmployees();

  const filteredCustomers = useMemo(() => {
    if (!custSearch || custSearch.length < 2) return [];
    return (customers || []).slice(0, 8);
  }, [customers, custSearch]);

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustSearch("");
    // Pre-fill address from customer
    if (c.address) {
      const parts = [c.address, c.city, c.state, c.zip].filter(Boolean);
      setAddress(parts.join(", "));
    }
  };

  const toggleAdditionalTeam = (employeeName: string) => {
    setAdditionalTeam((prev) =>
      prev.includes(employeeName)
        ? prev.filter((name) => name !== employeeName)
        : [...prev, employeeName]
    );
  };

  const handleCreate = async () => {
    if (!selectedCustomer) {
      toast({ title: "Select a customer", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Compute arrival times from window
    let arrival_start: string | null = null;
    let arrival_end: string | null = null;
    if (scheduledDate && arrivalWindow) {
      const win = jobType === "install"
        ? INSTALL_WINDOW
        : SERVICE_WINDOWS.find(w => w.label === arrivalWindow);
      if (win) {
        arrival_start = `${scheduledDate}T${win.start}:00`;
        arrival_end = `${scheduledDate}T${win.end}:00`;
      }
    }

    const isAgreementJob = agreementInfo?.hasAgreement === true;

    const jobData: any = {
      customer_id: selectedCustomer.id,
      customer_name: [selectedCustomer.first_name, selectedCustomer.last_name].filter(Boolean).join(" "),
      customer_phone: selectedCustomer.phone || selectedCustomer.mobile_phone,
      customer_email: selectedCustomer.email,
      address: address || null,
      job_type: jobType,
      scheduled_date: scheduledDate || null,
      assigned_to: assignedTo || null,
      description: description || null,
      status: scheduledDate ? "scheduled" : "new",
      arrival_start,
      arrival_end,
      is_service_agreement: isAgreementJob,
      ...(jobType === "maintenance" && season ? { season } : {}),
    };

    const { data: newJob, error } = await supabase.from("jobs").insert(formatJobData(jobData)).select().single();

    if (error) {
      toast({ title: "Error creating job", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Centralized post-creation: format, chat, line items, HCP, activity log
    if (newJob) {
      const extraMembers = additionalTeam
        .filter((name) => name && name !== assignedTo)
        .map((name) => {
          const employee = (employees || []).find((item) => item.name === name);
          return {
            job_id: newJob.id,
            employee_id: employee?.id || null,
            employee_name: name,
            role: "helper",
            is_primary: false,
          };
        });
      if (extraMembers.length > 0) {
        const { error: teamError } = await supabase.from("job_team_members" as any).upsert(extraMembers, {
          onConflict: "job_id,employee_name",
        });
        if (teamError) {
          console.warn("Could not add extra job team members:", teamError);
        }
      }

      try {
        await supabase.functions.invoke("finalize-job", {
          body: { job_id: newJob.id, created_by: "Office" },
        });
      } catch (e) {
        console.error("finalize-job error:", e);
      }
    }

    toast({ title: "Job created!" });
    qc.invalidateQueries({ queryKey: ["jobs"] });
    qc.invalidateQueries({ queryKey: ["chat-channels"] });
    qc.invalidateQueries({ queryKey: ["activity_log"] });
    setSaving(false);
    onOpenChange(false);
    // Reset form
    setSelectedCustomer(null);
    setJobType("service");
    setSeason("");
    setScheduledDate("");
    setAssignedTo("");
    setAdditionalTeam([]);
    setDescription("");
    setAddress("");
    setArrivalWindow("");
    setFeeAcknowledged(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Job</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer search */}
          <div>
            <Label>Customer</Label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between bg-muted rounded-md px-3 py-2 mt-1">
                <span className="text-sm font-medium">
                  {[selectedCustomer.first_name, selectedCustomer.last_name].filter(Boolean).join(" ")}
                  {selectedCustomer.phone && <span className="text-muted-foreground ml-2">({selectedCustomer.phone})</span>}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>Change</Button>
              </div>
            ) : (
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone, email..."
                  value={custSearch}
                  onChange={e => setCustSearch(e.target.value)}
                  className="pl-8"
                />
                {filteredCustomers.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        onClick={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      >
                        <span className="font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</span>
                        {c.phone && <span className="text-muted-foreground ml-2">{c.phone}</span>}
                        {c.address && <div className="text-xs text-muted-foreground">{c.address}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Job type */}
          <div>
            <Label>Job Type</Label>
            <Select value={jobType} onValueChange={setJobType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Season (maintenance only) */}
          {jobType === "maintenance" && (
            <div>
              <Label>Season</Label>
              <div className="flex gap-2 mt-1">
                {[{ value: "winter", label: "❄️ Winter (Heating)" }, { value: "spring", label: "☀️ Spring (Cooling)" }].map(s => (
                  <Button
                    key={s.value}
                    type="button"
                    size="sm"
                    variant={season === s.value ? "default" : "outline"}
                    className="flex-1 text-xs"
                    onClick={() => setSeason(season === s.value ? "" : s.value)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Membership auto-detect banner */}
          {jobType === "maintenance" && selectedCustomer && agreementInfo && (
            agreementInfo.hasAgreement ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Active Member — {agreementInfo.planName}
                  </span>
                </div>
                <ul className="text-xs text-emerald-700 dark:text-emerald-400 space-y-0.5 pl-7">
                  {agreementInfo.perks.length > 0
                    ? agreementInfo.perks.map((p, i) => <li key={i}>✓ {p}</li>)
                    : <li>✓ Active member benefits apply</li>}
                </ul>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Sales Opportunity!
                  </span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400 pl-7">
                  Offer a maintenance plan — benefits include:
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 pl-7">
                  {agreementInfo.perks.length > 0
                    ? agreementInfo.perks.map((p, i) => <li key={i}>• {p}</li>)
                    : <li>• Ask about our service plans!</li>}
                </ul>
              </div>
            )
          )}

          <div>
            <Label>Address</Label>
            <AddressAutocomplete value={address} onChange={setAddress} className="mt-1" />
          </div>

          {/* Date + Tech */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Scheduled Date</Label>
              <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Primary person</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {(employees || []).filter(e => e.is_active).map(emp => (
                    <SelectItem key={emp.id} value={emp.name}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {assignedTo && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <Label>Also add to this job</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(employees || []).filter(e => e.is_active && e.name !== assignedTo).map(emp => {
                  const id = `job-team-${emp.id}`;
                  return (
                    <label key={emp.id} htmlFor={id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                      <Checkbox
                        id={id}
                        checked={additionalTeam.includes(emp.name)}
                        onCheckedChange={() => toggleAdditionalTeam(emp.name)}
                      />
                      <span>{emp.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                The primary person owns the schedule card. Extra people stay attached for shared FIX quotes, ride-alongs, or helper work.
              </p>
            </div>
          )}

          {/* Arrival Window */}
          {scheduledDate && (
            <div>
              <Label>Arrival Window</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {jobType === "install" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={arrivalWindow === INSTALL_WINDOW.label ? "default" : "outline"}
                    className="text-xs"
                    onClick={() => setArrivalWindow(arrivalWindow === INSTALL_WINDOW.label ? "" : INSTALL_WINDOW.label)}
                  >
                    {INSTALL_WINDOW.label}
                  </Button>
                ) : (
                  SERVICE_WINDOWS.map(w => (
                    <Button
                      key={w.label}
                      type="button"
                      size="sm"
                      variant={arrivalWindow === w.label ? "default" : "outline"}
                      className="text-xs"
                      onClick={() => setArrivalWindow(arrivalWindow === w.label ? "" : w.label)}
                    >
                      {w.label}
                    </Button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} className="mt-1" rows={3} placeholder="Job details..." />
          </div>

          {/* Emergency Fee Acknowledgment */}
          {jobType === "service" && (
            <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
              <AlertTriangle className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium">Emergency Service Call-Out Fee: {emergencyFee}</p>
                <p className="text-xs text-muted-foreground">Customer must acknowledge the service call-out fee before scheduling.</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="fee-ack"
                    checked={feeAcknowledged}
                    onCheckedChange={(v) => setFeeAcknowledged(v === true)}
                  />
                  <label htmlFor="fee-ack" className="text-xs cursor-pointer">
                    Customer acknowledges the {emergencyFee} fee
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || (jobType === "service" && !feeAcknowledged)}>
            {saving ? "Creating..." : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
