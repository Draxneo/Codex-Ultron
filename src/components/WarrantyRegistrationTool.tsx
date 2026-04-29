import { useState } from "react";
import { Copy, ExternalLink, Check, Shield, ClipboardCheck, Bot, Loader2, AlertTriangle, MessageSquare } from "lucide-react";
import WarrantyLiveView from "@/components/WarrantyLiveView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { useWarrantyRegistration, useMarkWarrantyRegistered } from "@/hooks/useWarrantyRegistration";

import { useJobEquipment } from "@/hooks/useJobEquipment";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  jobId: string;
  customerName?: string;
  customerEmail?: string;
  address?: string;
  phone?: string;
  scheduledDate?: string;
  equipment?: {
    brand?: string;
    condenserModel?: string;
    coilModel?: string;
    furnaceModel?: string;
  };
}

const BRAND_PORTALS: Record<string, { url: string; label: string }> = {
  Carrier: { url: "https://productregistration.carrier.com/public/RegistrationForm_Carrier?brand=CARRIER", label: "Carrier" },
  "Day and Night": { url: "https://productregistration2.icpusa.com/public/RegistrationForm?brand=ICP", label: "Day and Night" },
  Goodman: { url: "https://warranty.goodmanmfg.com/newregistration/#/reg-layout", label: "Goodman" },
  Trane: { url: "https://www.trane.com/residential/en/resources/warranty-and-registration/register/", label: "Trane" },
};

function getBrandPortal(brand?: string) {
  const key = Object.keys(BRAND_PORTALS).find((k) => k.toLowerCase() === (brand || "").toLowerCase());
  return BRAND_PORTALS[key || "Carrier"] || BRAND_PORTALS["Carrier"];
}

function CopyField({ label, value }: { label: string; value: string }) {
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast({ title: "Copied", description: `${label} copied to clipboard` });
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn("text-sm font-mono truncate", !value && "text-muted-foreground italic")}>
          {value || "Not available"}
        </p>
      </div>
      {value && (
        <button
          onClick={copy}
          className="shrink-0 h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
          {step}
        </span>
        <h4 className="font-semibold text-sm text-foreground">{title}</h4>
      </div>
      <div className="space-y-2 pl-8">{children}</div>
    </div>
  );
}

export default function WarrantyRegistrationTool({ jobId, customerName, customerEmail, address, phone, scheduledDate, equipment }: Props) {
  const { data: registration, isLoading } = useWarrantyRegistration(jobId);
  const markRegistered = useMarkWarrantyRegistered();
  const { settings: companySettings } = useCompanySettings();
  const { data: equipmentSummary } = useJobEquipment(jobId);

  const portal = getBrandPortal(equipment?.brand);
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [regNotes, setRegNotes] = useState("");
  const [autoRegistering, setAutoRegistering] = useState(false);
  const [liveViewOpen, setLiveViewOpen] = useState(false);
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "filling" | "done" | "failed">("connecting");
  const [liveResult, setLiveResult] = useState<any>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sendingEmailSms, setSendingEmailSms] = useState(false);

  const serialNumbers = equipmentSummary?.serialNumbers || [];
  const modelNumbers = equipmentSummary?.modelNumbers || [];
  const hasConflicts = equipmentSummary?.hasConflicts || false;
  const confirmedRecords = (equipmentSummary?.records || []).filter(r => r.is_confirmed);

  const isRegistered = registration?.status === "registered";
  const isBrandSupported = ["day and night", "carrier", "goodman", "trane"].includes((equipment?.brand || "").toLowerCase());

  const handleMarkRegistered = () => {
    markRegistered.mutate(
      { jobId, confirmationNumber: confirmationNumber || undefined, notes: regNotes || undefined },
      {
        onSuccess: async () => {
          toast({ title: "Warranty marked as registered" });
        },
      }
    );
  };

  const handleAutoRegister = async () => {
    setAutoRegistering(true);
    setLiveViewUrl(null);
    setLiveStatus("connecting");
    setLiveResult(null);
    setLiveViewOpen(true);

    try {
      // Phase 1: Create browser session → get liveViewUrl
      const { data: sessionData, error: sessionError } = await supabase.functions.invoke("auto-register-warranty", {
        body: { job_id: jobId, action: "create_session" },
      });
      if (sessionError) throw sessionError;
      if (!sessionData?.success) throw new Error(sessionData?.error || "Failed to create session");

      setLiveViewUrl(sessionData.liveViewUrl);
      setActiveSessionId(sessionData.sessionId);
      setLiveStatus("filling");

      // Phase 2: Execute form fill on the existing session
      const { data, error } = await supabase.functions.invoke("auto-register-warranty", {
        body: { job_id: jobId, action: "execute", session_id: sessionData.sessionId },
      });
      if (error) throw error;

      const result = {
        submitted: data?.submitted || false,
        confirmationNumber: data?.confirmationNumber || null,
        errorDetail: data?.errorDetail || "",
        message: data?.message || "",
      };
      setLiveResult(result);

      if (data?.success && data?.submitted) {
        setLiveStatus("done");
        toast({
          title: "Warranty Auto-Registered!",
          description: data.confirmationNumber
            ? `Confirmation: ${data.confirmationNumber}`
            : "Registration submitted.",
        });
      } else {
        setLiveStatus("failed");
        toast({
          title: "Form filled — verify submission",
          description: data?.message || "Check the live view for details.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("Auto-register error:", err);
      setLiveStatus("failed");
      setLiveResult({ message: err.message || "Something went wrong", errorDetail: err.message });
      toast({
        title: "Auto-register failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setAutoRegistering(false);
    }
  };

  const handleLiveViewClose = async () => {
    // Close the Firecrawl session when user closes the dialog
    if (activeSessionId) {
      try {
        const firecrawlKey = ""; // session cleanup handled server-side on TTL
      } catch {}
      setActiveSessionId(null);
    }
  };

  // Parse address parts
  const addressParts = address?.split(",").map((s) => s.trim()) || [];

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {isRegistered ? (
        <div className="rounded-lg border-2 border-[hsl(var(--complete))]/50 bg-complete-bg p-4 flex items-center gap-3">
          <Shield className="h-5 w-5 text-[hsl(var(--complete))]" />
          <div>
            <p className="font-semibold text-foreground">Warranty Registered</p>
            <p className="text-xs text-muted-foreground">
              {registration.confirmation_number && <>Confirmation: {registration.confirmation_number} · </>}
              {registration.registered_at && new Date(registration.registered_at).toLocaleDateString("en-US")}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-destructive/30 bg-overdue-bg p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-foreground">Warranty Not Registered</p>
              <p className="text-xs text-muted-foreground">Register within 7 days of install</p>
            </div>
          </div>
          <Button onClick={() => window.open(portal.url, "_blank")} size="sm">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open {portal.label}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground px-1">
        Copy the data below and paste into the {portal.label} registration portal. Fields are organized to match the registration form steps.
      </p>

      {/* Step 1: Serial / Model */}
      <StepCard step={1} title="Serial # / Model #">
        {hasConflicts && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Serial/model conflict detected across sources — verify before registering
          </div>
        )}
        {serialNumbers.length > 0 ? (
          serialNumbers.map((sn, i) => {
            const record = equipmentSummary?.records.find(r => r.serial_number === sn);
            const isConfirmed = record?.is_confirmed;
            return (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1"><CopyField label={`Serial Number ${i + 1}`} value={sn} /></div>
                {isConfirmed ? (
                  <Badge variant="default" className="text-[10px] bg-primary/10 text-primary border-primary/20">Verified</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Unverified</Badge>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-xs text-muted-foreground italic">No serial numbers extracted yet. Upload supply house invoices in the Info tab.</p>
        )}
        {modelNumbers.length > 0 &&
          modelNumbers.map((mn, i) => <CopyField key={`m${i}`} label={`Model Number ${i + 1}`} value={mn} />)}
        {equipment?.condenserModel && <CopyField label="Condenser Model" value={equipment.condenserModel} />}
        {equipment?.coilModel && <CopyField label="Coil Model" value={equipment.coilModel} />}
        {equipment?.furnaceModel && <CopyField label="Furnace Model" value={equipment.furnaceModel} />}
        <CopyField label="Install Date" value={scheduledDate || ""} />
        <CopyField label="Brand" value={equipment?.brand || "Carrier"} />
      </StepCard>

      {/* Step 2: Equipment Owner */}
      <StepCard step={2} title="Equipment Owner">
        <CopyField label="Customer Name" value={customerName || ""} />
        <CopyField label="Email" value={customerEmail || companySettings.company_email || ""} />
        {!customerEmail && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive font-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              No customer email on file — {companySettings.company_email || "company email"} will be used. Reach out to the customer to get their email for warranty registration.
            </div>
            {phone && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                disabled={sendingEmailSms}
                onClick={async () => {
                  setSendingEmailSms(true);
                  try {
                    const firstName = customerName?.split(" ")[0] || "there";
                    const msg = `Hi ${firstName}, this is ${companySettings.company_name || "the Carnes family"}. We just wrapped up your install and want to make sure your warranty is registered the right way. Could you send us your email address so we can take care of that for you?`;
                    const { sendSmsImpl } = await import("@/hooks/useSendSms");
                    const result = await sendSmsImpl({
                      to: phone, body: msg, jobId, contactName: customerName || null,
                      contactType: "customer", source: "warranty_email_request", hitlApproved: true, silent: true,
                    });
                    if (!result.success) throw new Error(result.error || "Send failed");
                    toast({ title: "SMS Sent", description: `Asked ${firstName} for their email` });
                  } catch (e: any) {
                    toast({ title: "SMS Failed", description: e.message, variant: "destructive" });
                  } finally {
                    setSendingEmailSms(false);
                  }
                }}
              >
                {sendingEmailSms ? (
                  <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Sending…</>
                ) : (
                  <><MessageSquare className="h-3 w-3 mr-1.5" /> Text Customer for Email</>
                )}
              </Button>
            )}
          </div>
        )}
        <CopyField label="Address" value={address || ""} />
        <CopyField label="Phone" value={phone || ""} />
      </StepCard>

      {/* Step 3: Equipment Location */}
      <StepCard step={3} title="Equipment Location">
        <p className="text-xs text-muted-foreground">Usually same as owner address above.</p>
        <CopyField label="Install Address" value={address || ""} />
      </StepCard>

      {/* Step 4: Dealer Information */}
      <StepCard step={4} title="Dealer Information">
        <CopyField label="Company Name" value={companySettings.company_name} />
        <CopyField label="Address" value={companySettings.company_address} />
        <CopyField label="Phone" value={companySettings.company_phone} />
        <CopyField label="Email" value={companySettings.company_email} />
        <CopyField label="CIN Number" value={companySettings.cps_cin} />
      </StepCard>

      {/* Step 5: Warranty Details */}
      <StepCard step={5} title="Warranty Details">
        <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
          <p className="font-semibold">Recommended: 10-Year Parts Warranty</p>
          <p className="text-muted-foreground">
            Standard coverage with no additional cost. The Consumer Choice option (5yr parts + 3yr labor) 
            requires purchasing separately and is typically not selected.
          </p>
        </div>
      </StepCard>

      {/* Step 6: Review & Mark Complete */}
      <StepCard step={6} title="Review & Submit">
        {!isRegistered ? (
          <div className="space-y-3">
            {isBrandSupported && (
              <Button
                onClick={handleAutoRegister}
                disabled={autoRegistering || serialNumbers.length === 0}
                className="w-full"
                variant="default"
              >
                {autoRegistering ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Auto-Registering…</>
                ) : (
                  <><Bot className="h-4 w-4 mr-2" /> Auto-Register via {portal.label}</>
                )}
              </Button>
            )}
            {isBrandSupported && serialNumbers.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Upload supply house invoices first to enable auto-registration.</p>
            )}
            <Button
              onClick={() => window.open(portal.url, "_blank")}
              className="w-full"
              variant={isBrandSupported ? "outline" : "default"}
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Open {portal.label} Registration Portal
            </Button>
            <Separator />
            <p className="text-xs text-muted-foreground font-medium">After registering:</p>
            <div className="space-y-1">
              <Label className="text-xs">Confirmation Number (optional)</Label>
              <Input
                value={confirmationNumber}
                onChange={(e) => setConfirmationNumber(e.target.value)}
                placeholder={`From ${portal.label} confirmation page`}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={regNotes}
                onChange={(e) => setRegNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <Button
              onClick={handleMarkRegistered}
              disabled={markRegistered.isPending}
              className="w-full"
              variant="outline"
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              {markRegistered.isPending ? "Saving..." : "Mark as Registered"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[hsl(var(--complete))]">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">Registration complete</span>
          </div>
        )}
      </StepCard>

      {/* Live browser view dialog */}
      <WarrantyLiveView
        open={liveViewOpen}
        onOpenChange={setLiveViewOpen}
        liveViewUrl={liveViewUrl}
        status={liveStatus}
        result={liveResult}
        onClose={handleLiveViewClose}
      />
    </div>
  );
}
