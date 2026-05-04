import { useState } from "react";
import {
  Copy, ExternalLink, Building2, ClipboardCheck, Loader2, Phone, Mail as MailIcon,
  CheckCircle2, AlertTriangle, Bot, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { usePermitApplication, useUpsertPermitApplication } from "@/hooks/usePermitApplications";
import { useAuthorityForZip } from "@/hooks/usePermitAuthorities";
import { useJobEquipment } from "@/hooks/useJobEquipment";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { cn } from "@/lib/utils";

interface Props {
  jobId: string;
  customerName?: string;
  address?: string;
  phone?: string;
  zip?: string;
  jobType?: string;
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

export default function PermitApplicationTool({ jobId, customerName, address, phone, zip, jobType }: Props) {
  const authority = useAuthorityForZip(zip);
  const { data: permitApp, isLoading } = usePermitApplication(jobId);
  const upsertPermit = useUpsertPermitApplication();
  const { settings: companySettings } = useCompanySettings();
  const { data: equipmentSummary } = useJobEquipment(jobId);

  const [permitNumber, setPermitNumber] = useState("");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [notes, setNotes] = useState("");

  const isSubmitted = permitApp?.status === "submitted" || permitApp?.status === "approved";
  const hasPortal = !!authority?.permit_portal_url;
  const hasInspectionPhone = !!authority?.inspection_phone;

  const handleMarkSubmitted = () => {
    if (!authority) {
      toast({ title: "No authority found", description: `No permit authority for zip ${zip}`, variant: "destructive" });
      return;
    }
    upsertPermit.mutate({
      id: permitApp?.id,
      job_id: jobId,
      authority_id: authority.id,
      status: "submitted",
      permit_number: permitNumber || permitApp?.permit_number || undefined,
      confirmation_number: confirmationNumber || permitApp?.confirmation_number || undefined,
      submitted_at: new Date().toISOString(),
      notes: notes || permitApp?.notes || undefined,
    } as any);
  };

  const handleMarkApproved = () => {
    if (!permitApp) return;
    upsertPermit.mutate({
      ...permitApp,
      status: "approved",
      approved_at: new Date().toISOString(),
    } as any);
  };

  // Parse address
  const addressParts = address?.split(",").map((s) => s.trim()) || [];

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {isSubmitted ? (
        <div className="rounded-lg border-2 border-[hsl(var(--complete))]/50 bg-complete-bg p-4 flex items-center gap-3">
          <Building2 className="h-5 w-5 text-[hsl(var(--complete))]" />
          <div>
            <p className="font-semibold text-foreground">
              Permit {permitApp?.status === "approved" ? "Approved" : "Submitted"}
            </p>
            <p className="text-xs text-muted-foreground">
              {permitApp?.permit_number && <>Permit #: {permitApp.permit_number} · </>}
              {permitApp?.confirmation_number && <>Conf: {permitApp.confirmation_number} · </>}
              {authority?.name}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-accent/50 bg-accent/10 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-accent-foreground" />
            <div>
              <p className="font-semibold text-foreground">Permit Required</p>
              <p className="text-xs text-muted-foreground">
                {authority ? authority.name : `No authority found for zip ${zip}`}
                {authority?.jurisdiction_type && ` (${authority.jurisdiction_type})`}
              </p>
            </div>
          </div>
          {hasPortal && (
            <Button onClick={() => window.open(authority!.permit_portal_url!, "_blank")} size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Portal
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground px-1">
        {hasPortal
          ? `Copy the data below and paste into the ${authority?.name || "city"} permit portal. Fields are organized to match typical permit application forms.`
          : authority?.inspection_phone
            ? `Call ${authority.name} to apply for the permit. Use the data below for reference.`
            : "No online portal found for this jurisdiction. Check Admin → Permit Authorities."}
      </p>

      {/* Step 1: Property Info */}
      <StepCard step={1} title="Property Information">
        <CopyField label="Property Address" value={address || ""} />
        <CopyField label="Street" value={addressParts[0] || ""} />
        <CopyField label="City" value={addressParts[1] || ""} />
        {addressParts[2] && <CopyField label="State / Zip" value={addressParts[2]} />}
        <CopyField label="Zip Code" value={zip || ""} />
      </StepCard>

      {/* Step 2: Homeowner */}
      <StepCard step={2} title="Homeowner Information">
        <CopyField label="Homeowner Name" value={customerName || ""} />
        <CopyField label="Phone" value={phone || ""} />
      </StepCard>

      {/* Step 3: Contractor Info */}
      <StepCard step={3} title="Contractor Information">
        <CopyField label="Company Name" value={companySettings.company_name} />
        <CopyField label="License #" value={(companySettings as any).contractor_license || ""} />
        <CopyField label="Address" value={companySettings.company_address} />
        <CopyField label="Phone" value={companySettings.company_phone} />
        <CopyField label="Email" value={companySettings.company_email} />
      </StepCard>

      {/* Step 4: Equipment / Scope of Work */}
      <StepCard step={4} title="Scope of Work">
        <CopyField label="Job Type" value={jobType || "Mechanical"} />
        <CopyField label="Description" value={`${jobType || "HVAC"} equipment changeout — residential`} />
        {equipmentSummary?.records?.map((eq: any, i: number) => (
          <div key={i} className="space-y-1 pt-1 border-t border-border/50">
            <CopyField label="Brand" value={eq.brand || ""} />
            <CopyField label="Model" value={eq.model_number || ""} />
            <CopyField label="Equipment Type" value={eq.equipment_type || ""} />
          </div>
        ))}
        {(!equipmentSummary?.records?.length) && (
          <p className="text-xs text-muted-foreground italic">No equipment data yet — add from supply house invoices.</p>
        )}
      </StepCard>

      {/* Step 5: Contact Info for Jurisdiction */}
      {authority && (
        <StepCard step={5} title={`${authority.name} Contact`}>
          {authority.inspection_phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <CopyField label="Phone" value={authority.inspection_phone} />
            </div>
          )}
          {authority.contact_email && (
            <div className="flex items-center gap-2">
              <MailIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <CopyField label="Email" value={authority.contact_email} />
            </div>
          )}
          {authority.notes && (
            <p className="text-[10px] text-muted-foreground bg-muted rounded p-2">{authority.notes}</p>
          )}
        </StepCard>
      )}

      {/* Step 6: Mark Complete */}
      <StepCard step={authority ? 6 : 5} title="Track Permit Status">
        {!isSubmitted ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Permit Number (if assigned)</Label>
              <Input
                value={permitNumber}
                onChange={(e) => setPermitNumber(e.target.value)}
                placeholder="From the city portal or receipt"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirmation / Reference #</Label>
              <Input
                value={confirmationNumber}
                onChange={(e) => setConfirmationNumber(e.target.value)}
                placeholder="Online confirmation number"
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
            <Button
              onClick={handleMarkSubmitted}
              disabled={upsertPermit.isPending}
              className="w-full"
              variant="outline"
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              {upsertPermit.isPending ? "Saving..." : "Mark Permit as Submitted"}
            </Button>
          </div>
        ) : permitApp?.status === "submitted" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-accent-foreground">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">Permit submitted — awaiting approval</span>
            </div>
            <Button onClick={handleMarkApproved} disabled={upsertPermit.isPending} className="w-full" variant="outline">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark as Approved
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[hsl(var(--complete))]">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Permit approved</span>
          </div>
        )}
      </StepCard>
    </div>
  );
}
