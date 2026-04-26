import { useState } from "react";
import { Loader2, MapPin, User, Calendar, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type SuggestedAction = {
  type: "book_job" | "book_estimate" | "book_maintenance" | "create_customer";
  job_type?: string;
  customer_name?: string;
  customer_id?: string;
  phone?: string;
  address?: string;
  description?: string;
  email?: string;
};

type ScheduleSlot = {
  date: string;
  time: string;
  tech: string;
  travel_min: number;
  fit_score: number;
};

interface InlineBookingWizardProps {
  action: SuggestedAction;
  onComplete: (summary: string) => void;
  onCancel: () => void;
}

export function InlineBookingWizard({ action, onComplete, onCancel }: InlineBookingWizardProps) {
  const [step, setStep] = useState<"customer" | "schedule" | "confirm">(
    action.type === "create_customer" ? "customer" : "customer"
  );
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  
  // Editable customer fields
  const [customerName, setCustomerName] = useState(action.customer_name || "");
  const [phone, setPhone] = useState(action.phone || "");
  const [address, setAddress] = useState(action.address || "");
  const [email, setEmail] = useState(action.email || "");
  const [description, setDescription] = useState(action.description || "");

  const jobTypeLabel = {
    book_job: "Service Call",
    book_estimate: "Estimate",
    book_maintenance: "Maintenance",
    create_customer: "New Customer",
  }[action.type] || "Job";

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-schedule-slots", {
        body: {
          address: address,
          job_type: action.job_type || (action.type === "book_estimate" ? "estimate" : action.type === "book_maintenance" ? "maintenance" : "service"),
        },
      });
      if (error) throw error;
      setSlots(data?.slots || []);
    } catch (e: any) {
      console.error("Failed to fetch schedule slots:", e);
      toast({ title: "Schedule Error", description: "Couldn't load schedule suggestions. You can still pick a custom time.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerConfirm = async () => {
    if (action.type === "create_customer") {
      // For create_customer, just queue it
      await handleCreateCustomer();
      return;
    }
    // Move to schedule step
    await fetchSlots();
    setStep("schedule");
  };

  const handleCreateCustomer = async () => {
    setLoading(true);
    try {
      const nameParts = customerName.trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      onComplete(
        `Create customer: ${customerName}${phone ? `, phone: ${phone}` : ""}${address ? `, address: ${address}` : ""}${email ? `, email: ${email}` : ""}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleConfirm = () => {
    setStep("confirm");
  };

  const handleFinalConfirm = async () => {
    setLoading(true);
    try {
      const slot = selectedSlot;
      const dateStr = slot?.date || customDate;
      const timeStr = slot?.time || customTime;
      const techStr = slot?.tech || "";

      // Send as a structured message back to chat for JARVIS to process
      const parts = [
        `Book ${jobTypeLabel} for ${customerName}`,
        address ? `at ${address}` : null,
        dateStr ? `on ${dateStr}` : null,
        timeStr ? `at ${timeStr}` : null,
        techStr ? `with ${techStr}` : null,
        description ? `— ${description}` : null,
        phone ? `phone: ${phone}` : null,
      ].filter(Boolean).join(", ");

      onComplete(parts);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-l-4 border-l-primary bg-card shadow-sm mr-8 mt-2 ml-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b">
        <div className="flex items-center gap-1.5 text-xs">
          <Badge
            variant={step === "customer" ? "default" : "secondary"}
            className="text-[10px] px-1.5"
          >
            1
          </Badge>
          <span className={cn("text-[10px]", step === "customer" ? "font-semibold" : "text-muted-foreground")}>
            Customer
          </span>
          {action.type !== "create_customer" && (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <Badge
                variant={step === "schedule" ? "default" : "secondary"}
                className="text-[10px] px-1.5"
              >
                2
              </Badge>
              <span className={cn("text-[10px]", step === "schedule" ? "font-semibold" : "text-muted-foreground")}>
                Schedule
              </span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <Badge
                variant={step === "confirm" ? "default" : "secondary"}
                className="text-[10px] px-1.5"
              >
                3
              </Badge>
              <span className={cn("text-[10px]", step === "confirm" ? "font-semibold" : "text-muted-foreground")}>
                Confirm
              </span>
            </>
          )}
        </div>
        <div className="flex-1" />
        <button onClick={onCancel} className="text-[10px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Step 1: Customer */}
        {step === "customer" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">
                {action.type === "create_customer" ? "New Customer" : `${jobTypeLabel} — Confirm Customer`}
              </span>
              {action.customer_id && (
                <Badge variant="secondary" className="text-[10px]">Match found</Badge>
              )}
            </div>
            <div className="grid gap-2">
              <div>
                <Label className="text-[10px]">Name</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px]">Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-[10px]">Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-8 text-sm" />
              </div>
              {action.type !== "create_customer" && (
                <div>
                  <Label className="text-[10px]">Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-sm" placeholder="Brief description..." />
                </div>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleCustomerConfirm}
              disabled={!customerName.trim() || loading}
              className="w-full gap-1.5"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {action.type === "create_customer" ? "Create Customer" : "Next — Pick Schedule"}
            </Button>
          </>
        )}

        {/* Step 2: Schedule */}
        {step === "schedule" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Pick Schedule Slot</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Finding best slots...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {slots.length > 0 && (
                  <div className="space-y-2">
                    {slots.slice(0, 3).map((slot, i) => (
                      <button
                        key={i}
                        onClick={() => { setSelectedSlot(slot); setCustomDate(""); setCustomTime(""); }}
                        className={cn(
                          "w-full text-left rounded-lg border p-3 transition-all",
                          selectedSlot === slot
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-primary/30 hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">📅 {slot.date} at {slot.time}</div>
                            <div className="text-xs text-muted-foreground">
                              👷 {slot.tech} — {slot.travel_min} min from prev job
                            </div>
                          </div>
                          {i === 0 && <Badge className="text-[9px] bg-primary/10 text-primary border-0">⚡ Best fit</Badge>}
                          {selectedSlot === slot && <Check className="h-4 w-4 text-primary" />}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom time option */}
                <div className={cn(
                  "rounded-lg border p-3",
                  !selectedSlot && (customDate || customTime) ? "border-primary bg-primary/5" : "border-dashed"
                )}>
                  <div className="text-xs font-medium mb-2 text-muted-foreground">Custom Time</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={customDate}
                      onChange={(e) => { setCustomDate(e.target.value); setSelectedSlot(null); }}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="time"
                      value={customTime}
                      onChange={(e) => { setCustomTime(e.target.value); setSelectedSlot(null); }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setStep("customer")} className="text-xs">
                    Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleScheduleConfirm}
                    disabled={!selectedSlot && (!customDate || !customTime)}
                    className="flex-1 gap-1.5 text-xs"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    Next — Confirm
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Confirm & Queue</span>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{jobTypeLabel}</span>
                <Badge variant="outline" className="text-[9px]">Pending Approval</Badge>
              </div>
              <div>👤 {customerName}</div>
              {address && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {address}</div>}
              {(selectedSlot || (customDate && customTime)) && (
                <div>📅 {selectedSlot ? `${selectedSlot.date} at ${selectedSlot.time}` : `${customDate} at ${customTime}`}</div>
              )}
              {selectedSlot?.tech && <div>👷 {selectedSlot.tech}</div>}
              {description && <div>📝 {description}</div>}
              {phone && <div>📞 {phone}</div>}
            </div>

            <p className="text-[10px] text-muted-foreground">
              This will create an approval card in Mission Control. The job is NOT booked until you approve it.
            </p>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setStep("schedule")} className="text-xs">
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleFinalConfirm}
                disabled={loading}
                className="flex-1 gap-1.5 text-xs"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Queue for Approval
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
