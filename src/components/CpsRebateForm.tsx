import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Printer, DollarSign, FileText, AlertTriangle, Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";

import { toast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";

// CPS SEER2 tier structure
const TIERS = [
  { name: "Tier 1", min: 13.8, max: 15.1, earlyPer: 115, burnoutPer: 90 },
  { name: "Tier 2", min: 15.2, max: 16.1, earlyPer: 130, burnoutPer: 120 },
  { name: "Tier 3", min: 16.2, max: 17.0, earlyPer: 175, burnoutPer: 150 },
  { name: "Tier 4", min: 17.1, max: 19.9, earlyPer: 250, burnoutPer: 225 },
  { name: "Tier 5", min: 20.0, max: 99,   earlyPer: 310, burnoutPer: 275 },
];

// BTUh to tonnage conversion (CPS chart)
function btuhToTons(btuh: number): number {
  if (btuh < 18000) return 1.0;
  if (btuh < 21000) return 1.5;
  if (btuh < 27000) return 2.0;
  if (btuh < 33000) return 2.5;
  if (btuh < 39000) return 3.0;
  if (btuh < 45000) return 3.5;
  if (btuh < 54000) return 4.0;
  return 5.0;
}

function getTier(seer2: number) {
  return TIERS.find((t) => seer2 >= t.min && seer2 <= t.max) || null;
}

// Minimum qualification check
function meetsMinimum(systemType: string, btuh: number, seer2: number, eer2: number, hspf2?: number): { qualifies: boolean; reason?: string } {
  if (systemType === "heat_pump") {
    if (seer2 < 14.3) return { qualifies: false, reason: "SEER2 must be ≥ 14.3 for heat pumps" };
    if (eer2 < 11.7 && seer2 < 15.2) return { qualifies: false, reason: "EER2 must be ≥ 11.7 (or SEER2 ≥ 15.2 for 9.8 EER2 exception)" };
    if (seer2 >= 15.2 && eer2 < 9.8) return { qualifies: false, reason: "EER2 must be ≥ 9.8 for systems with SEER2 ≥ 15.2" };
    if (hspf2 !== undefined && hspf2 < 7.5) return { qualifies: false, reason: "HSPF2 must be ≥ 7.5 for heat pumps" };
    return { qualifies: true };
  }
  // Central AC
  if (btuh < 45000) {
    if (seer2 < 14.3) return { qualifies: false, reason: "SEER2 must be ≥ 14.3 for systems < 45,000 BTUh" };
    if (eer2 < 11.7 && seer2 < 15.2) return { qualifies: false, reason: "EER2 must be ≥ 11.7 (or SEER2 ≥ 15.2 for 9.8 EER2 exception)" };
    if (seer2 >= 15.2 && eer2 < 9.8) return { qualifies: false, reason: "EER2 must be ≥ 9.8 for systems with SEER2 ≥ 15.2" };
  } else {
    if (seer2 < 13.8) return { qualifies: false, reason: "SEER2 must be ≥ 13.8 for systems ≥ 45,000 BTUh" };
    if (eer2 < 11.2 && seer2 < 15.2) return { qualifies: false, reason: "EER2 must be ≥ 11.2 (or SEER2 ≥ 15.2 for 9.8 EER2 exception)" };
    if (seer2 >= 15.2 && eer2 < 9.8) return { qualifies: false, reason: "EER2 must be ≥ 9.8 for systems with SEER2 ≥ 15.2" };
  }
  return { qualifies: true };
}

export interface CpsRebateJobData {
  jobId?: string;
  customerName?: string;
  address?: string;
  phone?: string;
  email?: string;
  scheduledDate?: string;
  jobType?: string;
  parsedTonnage?: number | null;
  jobNumber?: string;
}

export interface CpsRebateCompanyData {
  companyName?: string;
  contactName?: string;
  licenseNumber?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
}

export interface CpsRebateEquipmentData {
  brand?: string;
  condenserModel?: string;
  coilModel?: string;
  furnaceModel?: string;
  ahriNumber?: string;
  seer2?: number;
  eer2?: number;
  hspf2?: number;
  coolingCap?: number;
  systemType?: string;
}

interface Props {
  job: CpsRebateJobData;
  equipment?: CpsRebateEquipmentData;
  company?: CpsRebateCompanyData;
}

export default function CpsRebateForm({ job, equipment, company }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings } = useCompanySettings();

  // Parse first/last name from full customer name
  const nameParts = (job.customerName || "").trim().split(/\s+/);
  const parsedFirst = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
  const parsedLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || "";

  // Parse city, state, ZIP from address like "123 Main St, San Antonio, TX 78201"
  const addressStr = job.address || "";
  const addrParts = addressStr.split(",").map((s) => s.trim());
  let parsedCity = "San Antonio";
  let parsedZip = "";
  if (addrParts.length >= 3) {
    parsedCity = addrParts[addrParts.length - 2] || "San Antonio";
    const stateZip = addrParts[addrParts.length - 1];
    const zipMatch = stateZip.match(/(\d{5})/);
    if (zipMatch) parsedZip = zipMatch[1];
  } else if (addrParts.length === 2) {
    const stateZip = addrParts[1];
    const zipMatch = stateZip.match(/(\d{5})/);
    if (zipMatch) parsedZip = zipMatch[1];
    const cityMatch = stateZip.match(/^([A-Za-z\s]+)/);
    if (cityMatch && cityMatch[1].trim().length > 2) parsedCity = cityMatch[1].trim();
  }

  // Account holder info
  const [firstName, setFirstName] = useState(parsedFirst);
  const [lastName, setLastName] = useState(parsedLast);
  const [accountNumber, setAccountNumber] = useState("");
  const [installAddress, setInstallAddress] = useState(addressStr);
  const [city, setCity] = useState(parsedCity);
  const [state] = useState("TX");
  const [zip, setZip] = useState(parsedZip);
  const [email, setEmail] = useState(job.email || "");
  const [contactPhone, setContactPhone] = useState(job.phone || "");

  // Rebate type
  const [rebateType, setRebateType] = useState<"early_replacement" | "burnout">("early_replacement");
  const [paymentType, setPaymentType] = useState<"bill_credit" | "check">("bill_credit");

  // Contractor info (from company settings)
  const [contractorName] = useState(company?.companyName || DEFAULT_COMPANY_NAME);
  const [contractorContact] = useState(company?.contactName || "");
  const [contractorAddress] = useState(company?.companyAddress || "");
  const [licenseNumber, setLicenseNumber] = useState(company?.licenseNumber || "");
  const [permitNumber, setPermitNumber] = useState("");
  const [installDate, setInstallDate] = useState(job.scheduledDate || "");

  // Equipment (pre-filled from matchup)
  const [unitType, setUnitType] = useState<string>(
    equipment?.systemType === "heat_pump" || equipment?.systemType === "dual_fuel" ? "heat_pump" : "central_ac"
  );
  const [manufacturer, setManufacturer] = useState(equipment?.brand || "");
  const [ahriNumber, setAhriNumber] = useState(equipment?.ahriNumber || "");
  const [btuh, setBtuh] = useState(equipment?.coolingCap != null ? String(equipment.coolingCap) : "");
  const [seer2, setSeer2] = useState(equipment?.seer2 != null ? String(equipment.seer2) : "");
  const [eer2, setEer2] = useState(equipment?.eer2 != null ? String(equipment.eer2) : "");
  const [hspf2, setHspf2] = useState(equipment?.hspf2 != null ? String(equipment.hspf2) : "");

  // Existing systems (Early Replacement) — up to 3
  const [existingAge, setExistingAge] = useState("");
  const [existingOperational, setExistingOperational] = useState("yes");
  const [photosProvided, setPhotosProvided] = useState("yes");
  const [existingHeatType, setExistingHeatType] = useState("air_source");

  const emptySystem = { outdoorModel: "", outdoorSerial: "", indoorModel: "", indoorSerial: "", furnaceModel: "", furnaceSerial: "" };
  const [existingSystems, setExistingSystems] = useState([
    { ...emptySystem }, // System 1
    { ...emptySystem }, // System 2
    { ...emptySystem }, // System 3
  ]);

  const updateSystem = (idx: number, field: string, value: string) => {
    setExistingSystems((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  // Calculated values
  const calc = useMemo(() => {
    const s = parseFloat(seer2);
    const e = parseFloat(eer2);
    const h = parseFloat(hspf2);
    const b = parseFloat(btuh);

    if (!s || !e) return null;

    // Use job-parsed tonnage first, then BTUh conversion
    const tons = job.parsedTonnage || (b ? btuhToTons(b) : null);
    if (!tons) return null;

    const qualification = meetsMinimum(
      unitType === "heat_pump" ? "heat_pump" : "ac",
      b || (tons * 12000), s, e, unitType === "heat_pump" ? h : undefined
    );

    if (!qualification.qualifies) return { qualifies: false, reason: qualification.reason };

    const tier = getTier(s);
    if (!tier) return { qualifies: false, reason: `SEER2 ${s} doesn't fall in any rebate tier` };

    const perTon = rebateType === "early_replacement" ? tier.earlyPer : tier.burnoutPer;
    const rebateAmount = perTon * tons;

    return {
      qualifies: true,
      tier: tier.name,
      tons,
      perTon,
      rebateAmount,
      seer2Range: `${tier.min} - ${tier.max}`,
    };
  }, [seer2, eer2, hspf2, btuh, unitType, rebateType, job.parsedTonnage]);

  const handlePrint = () => {
    window.print();
  };

  const [emailing, setEmailing] = useState(false);

  const buildPrintHtml = (): string => {
    const rebateLabel = rebateType === "early_replacement" ? "Early Replacement" : "Replace on Burnout";
    const payLabel = paymentType === "bill_credit" ? "Bill Credit" : "Incentive Check";
    const unitLabel = unitType === "central_ac" ? "Central A/C" : unitType === "heat_pump" ? "Heat Pump" : "Ductless Mini-Split";
    const tons = job.parsedTonnage || (btuh ? btuhToTons(parseFloat(btuh) || 0) : null);

    const rebateSummary = calc?.qualifies
      ? `<div style="background:#dcfce7;border:2px solid #16a34a;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
          <div style="font-size:22px;font-weight:900;color:#14532d;">Estimated Rebate: $${(calc as any).rebateAmount?.toLocaleString()}</div>
          <div style="font-size:14px;font-weight:600;color:#1f2937;margin-top:4px;">${(calc as any).tier} · ${(calc as any).tons} tons × $${(calc as any).perTon}/ton · ${rebateLabel}</div>
        </div>`
      : calc
        ? `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:24px;">
            <div style="font-size:16px;font-weight:700;color:#dc2626;">Does Not Qualify</div>
            <div style="font-size:13px;color:#4b5563;margin-top:4px;">${calc.reason || ""}</div>
          </div>`
        : "";

    const fieldStyle = `style="background:#ffffff;border:1.5px solid #9ca3af;border-radius:4px;padding:7px 10px;font-size:14px;color:#000000;font-weight:500;font-family:'Courier New',Courier,monospace;"`;
    const labelStyle = `style="font-size:11px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;"`;
    const sectionStyle = `style="border:1px solid #d1d5db;border-radius:8px;padding:20px;margin-bottom:20px;background:#ffffff;"`;
    const headingStyle = `style="font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;margin:0 0 16px 0;padding-bottom:8px;border-bottom:2px solid #d1d5db;"`;

    const field = (label: string, value: string) =>
      `<div style="flex:1;min-width:0;"><div ${labelStyle}>${label}</div><div ${fieldStyle}>${value || "&nbsp;"}</div></div>`;

    const row = (...fields: string[]) =>
      `<div style="display:flex;gap:12px;margin-bottom:10px;">${fields.join("")}</div>`;

    const existingSection = rebateType === "early_replacement" ? `
      <div ${sectionStyle}>
        <div ${headingStyle}>Existing System (Early Replacement)</div>
        <div style="font-size:11px;color:#374151;margin-bottom:12px;">Existing system must be operational and less than 25 years old (20 for heat pumps). Photos and model/serial numbers required.</div>
        ${row(
          field("System Age (years)", existingAge),
          field("Photos Provided", photosProvided === "yes" ? "Yes" : "No"),
          field("Operational", existingOperational === "yes" ? "Yes" : "No"),
          unitType === "heat_pump" ? field("Existing Heat Type", existingHeatType === "electrical_resistance" ? "Elec. Resistance" : "Air Source HP") : ""
        )}
        ${existingSystems.map((sys, i) => {
          const hasData = sys.outdoorModel || sys.outdoorSerial || sys.indoorModel || sys.indoorSerial || sys.furnaceModel || sys.furnaceSerial;
          const na = i > 0 && !hasData;
          const label = `Existing System ${i + 1}`;
          return `
            <div style="margin-top:${i > 0 ? "16px" : "8px"};padding-top:${i > 0 ? "12px" : "0"};${i > 0 ? "border-top:1px solid #e5e7eb;" : ""}">
              <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">${label}${na ? ' — <span style="color:#9ca3af;font-weight:400;">N/A</span>' : ""}</div>
              ${na ? "" : `
                ${row(field("Outdoor Model", sys.outdoorModel || (i > 0 ? "N/A" : "")), field("Outdoor Serial", sys.outdoorSerial || (i > 0 ? "N/A" : "")))}
                ${row(field("Indoor Model", sys.indoorModel || (i > 0 ? "N/A" : "")), field("Indoor Serial", sys.indoorSerial || (i > 0 ? "N/A" : "")))}
                ${row(field("Furnace Model", sys.furnaceModel || (i > 0 ? "N/A" : "")), field("Furnace Serial", sys.furnaceSerial || (i > 0 ? "N/A" : "")))}
              `}
            </div>
          `;
        }).join("")}
      </div>
    ` : "";

    const tierRows = TIERS.map((t) => {
      const isActive = calc?.qualifies && (calc as any).tier === t.name;
      const bg = isActive ? "background:#eff6ff;" : "";
      const fw = isActive ? "font-weight:700;" : "";
      return `<tr style="${bg}${fw}">
        <td style="border:1px solid #d1d5db;padding:6px 10px;">${t.name}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;">${t.min} – ${t.max === 99 ? "20.0+" : t.max}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:right;">$${t.earlyPer}/ton</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:right;">$${t.burnoutPer}/ton</td>
      </tr>`;
    }).join("");

    const checkItem = (text: string) =>
      `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
        <div style="width:14px;height:14px;border:1.5px solid #9ca3af;border-radius:3px;flex-shrink:0;margin-top:1px;"></div>
        <span style="font-size:12px;color:#4b5563;">${text}</span>
      </div>`;

    return `
      <div style="width:1200px;padding:40px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;box-sizing:border-box;">
        <!-- Header -->
        <div style="background:#1e3a5f;color:#ffffff;padding:24px 28px;border-radius:8px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:24px;font-weight:900;letter-spacing:0.5px;color:#ffffff;">CPS Energy HVAC Rebate Application</div>
            <div style="font-size:14px;font-weight:600;color:#cbd5e1;margin-top:4px;">Residential Cooling &amp; Heating Incentive Program</div>
          </div>
          <div style="text-align:right;font-size:13px;font-weight:700;color:#e2e8f0;">
            <div>Job# ${job.jobNumber || "N/A"}</div>
            <div>${installDate || "—"}</div>
          </div>
        </div>

        ${rebateSummary}

        <!-- Account Holder -->
        <div ${sectionStyle}>
          <div ${headingStyle}>CPS Energy Account Holder Information</div>
          ${row(field("First Name", firstName), field("Last Name", lastName), field("Account Number", accountNumber))}
          ${row(field("Installation Address", installAddress), field("City", city))}
          ${row(field("State", state), field("ZIP", zip), field("Email", email), field("Phone", contactPhone))}
          <div style="display:flex;gap:40px;margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">
            <div><span style="font-size:11px;color:#6b7280;font-weight:600;">Rebate Type:</span> <span style="font-size:13px;font-weight:600;color:#1e3a5f;">${rebateLabel}</span></div>
            <div><span style="font-size:11px;color:#6b7280;font-weight:600;">Payment Type:</span> <span style="font-size:13px;font-weight:600;color:#1e3a5f;">${payLabel}</span></div>
          </div>
        </div>

        <!-- Contractor -->
        <div ${sectionStyle}>
          <div ${headingStyle}>Installing Contractor Information</div>
          ${row(field("Company Name", contractorName), field("Contact Name", contractorContact))}
          ${row(field("License Number", licenseNumber), field("Permit Number", permitNumber), field("Install Date", installDate))}
        </div>

        <!-- New System -->
        <div ${sectionStyle}>
          <div ${headingStyle}>New System Information</div>
          ${row(field("Unit Type", unitLabel), field("Manufacturer", manufacturer), field("AHRI Certificate #", ahriNumber))}
          ${row(field("BTUh (Cooling Cap)", btuh), field("SEER2", seer2), field("EER2", eer2), field("HSPF2", unitType === "heat_pump" ? hspf2 : "N/A"))}
          ${tons ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">CPS Tonnage: <strong>${tons} tons</strong>${btuh ? ` (based on ${parseInt(btuh).toLocaleString()} BTUh)` : ""}</div>` : ""}
        </div>

        ${existingSection}

        <!-- Tier Reference -->
        <div ${sectionStyle}>
          <div ${headingStyle}>CPS Rebate Tier Reference</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:700;">Tier</th>
                <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:700;">SEER2 Range</th>
                <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:right;font-weight:700;">Early Replacement</th>
                <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:right;font-weight:700;">Replace on Burnout</th>
              </tr>
            </thead>
            <tbody>${tierRows}</tbody>
          </table>
        </div>

        <!-- Checklist -->
        <div ${sectionStyle}>
          <div ${headingStyle}>Required Documents Checklist</div>
          ${checkItem("Itemized invoice (model/serial #s, install date, address, total cost)")}
          ${checkItem("AHRI certificate or certificate number")}
          ${rebateType === "early_replacement" ? checkItem("Photos of existing system") : ""}
          ${checkItem("Permit information (City of San Antonio)")}
          <div style="font-size:10px;color:#9ca3af;margin-top:12px;">Submit to: CPSEnergyResidential@clearesult.com · Must be received within 30 days of installation</div>
        </div>
      </div>
    `;
  };

  const generatePngBase64 = async (): Promise<string> => {
    // Build a standalone HTML string with all inline styles — no Tailwind, no CSS variables
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-9999px;top:0;width:1200px;z-index:-1;";
    container.innerHTML = buildPrintHtml();
    document.body.appendChild(container);

    // Let browser lay out the HTML
    await new Promise((r) => setTimeout(r, 100));

    try {
      const canvas = await html2canvas(container, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 1200,
      });

      let dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const sizeBytes = base64.length * 0.75;
      if (sizeBytes > 4 * 1024 * 1024) {
        dataUrl = canvas.toDataURL("image/jpeg", 0.98);
        return dataUrl.split(",")[1];
      }
      return base64;
    } finally {
      container.remove();
    }
  };

  const handleEmail = async () => {
    if (!email) {
      toast({ title: "No email", description: "Customer email is required to send.", variant: "destructive" });
      return;
    }
    setEmailing(true);
    try {
      const imageBase64 = await generatePngBase64();
      const subject = `CPS Rebate Form Job# ${job.jobNumber || "N/A"} ${job.customerName || ""}`.trim();

      const { data, error } = await supabase.functions.invoke("send-rebate-email", {
        body: {
          to: settings?.company_email || "",
          subject,
          imageBase64,
          customerName: job.customerName || "",
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Email Sent", description: `Rebate form sent to ${email}` });

      // Completion timestamps are tracked directly on the job
    } catch (err: any) {
      console.error("Email error:", err);
      toast({ title: "Email Failed", description: err.message || "Failed to send email", variant: "destructive" });
    } finally {
      setEmailing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Rebate Calculator Banner */}
      {calc && (
        <div className={cn(
          "rounded-lg border-2 p-4",
          calc.qualifies
            ? "border-[hsl(var(--complete))]/50 bg-complete-bg"
            : "border-destructive/50 bg-overdue-bg"
        )}>
          {calc.qualifies ? (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[hsl(var(--complete))]" />
                  <span className="font-bold text-lg text-foreground">
                    Estimated Rebate: ${(calc as any).rebateAmount?.toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {(calc as any).tier} · {(calc as any).tons} tons × ${(calc as any).perTon}/ton ·{" "}
                  {rebateType === "early_replacement" ? "Early Replacement" : "Replace on Burnout"}
                </p>
              </div>
              <Badge variant="default" className="text-sm">
                {(calc as any).tier}: SEER2 {(calc as any).seer2Range}
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Does not qualify</p>
                <p className="text-sm text-muted-foreground">{calc.reason}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Printable form area */}
      <div ref={printRef} className="print-area space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5" /> CPS Energy HVAC Rebate Application
          </h3>
          <div className="flex gap-2">
            <Button onClick={handleEmail} variant="outline" size="sm" disabled={emailing}>
              {emailing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
              {emailing ? "Sending..." : "Email"}
            </Button>
            <Button onClick={handlePrint} variant="outline" size="sm">
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
          </div>
        </div>

        {/* Section 1: Account Holder */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm text-foreground uppercase tracking-wide">
            CPS Energy Account Holder Information
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last Name *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account Number</Label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="CPS account #" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Installation Address</Label>
              <AddressAutocomplete value={installAddress} onChange={setInstallAddress} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">State</Label>
                <Input value={state} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ZIP</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="78XXX" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact Phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Rebate Type</Label>
              <RadioGroup value={rebateType} onValueChange={(v) => setRebateType(v as any)} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="early_replacement" id="early" />
                  <Label htmlFor="early" className="text-sm cursor-pointer">Early Replacement</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="burnout" id="burnout" />
                  <Label htmlFor="burnout" className="text-sm cursor-pointer">Replace on Burnout</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Payment Type</Label>
              <RadioGroup value={paymentType} onValueChange={(v) => setPaymentType(v as any)} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="bill_credit" id="bill" />
                  <Label htmlFor="bill" className="text-sm cursor-pointer">Bill Credit</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="check" id="check" />
                  <Label htmlFor="check" className="text-sm cursor-pointer">Incentive Check</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </div>

        {/* Section 2: Contractor */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm text-foreground uppercase tracking-wide">
            Installing Contractor Information
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Company Name</Label>
              <Input value={contractorName} disabled className="bg-muted" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact Name</Label>
              <Input value={contractorContact} disabled className="bg-muted" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">License Number</Label>
              <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="TACLA#" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Permit Number *</Label>
              <Input value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} placeholder="Required in SA" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Install Date</Label>
              <Input value={installDate} onChange={(e) => setInstallDate(e.target.value)} type="date" />
            </div>
          </div>
        </div>

        {/* Section 3: New System */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm text-foreground uppercase tracking-wide">
            New System Information
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Qualifying Unit Type</Label>
              <Select value={unitType} onValueChange={setUnitType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="central_ac">Central A/C</SelectItem>
                  <SelectItem value="heat_pump">Heat Pump</SelectItem>
                  <SelectItem value="mini_split">Ductless Mini-Split</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Manufacturer</Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">AHRI Certificate Number</Label>
              <Input value={ahriNumber} onChange={(e) => setAhriNumber(e.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">BTUh (Cooling Cap)</Label>
              <Input value={btuh} onChange={(e) => setBtuh(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SEER2</Label>
              <Input value={seer2} onChange={(e) => setSeer2(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">EER2</Label>
              <Input value={eer2} onChange={(e) => setEer2(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">HSPF2</Label>
              <Input value={hspf2} onChange={(e) => setHspf2(e.target.value)} className="font-mono" placeholder={unitType !== "heat_pump" ? "N/A" : ""} />
            </div>
          </div>
          {btuh && (
            <p className="text-xs text-muted-foreground">
              CPS Tonnage: <span className="font-semibold">{btuhToTons(parseFloat(btuh) || 0)} tons</span> (based on {parseInt(btuh).toLocaleString()} BTUh)
            </p>
          )}
        </div>

        {/* Section 4: Early Replacement (conditional) */}
        {rebateType === "early_replacement" && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h4 className="font-semibold text-sm text-foreground uppercase tracking-wide">
              Existing System (Early Replacement)
            </h4>
            <p className="text-xs text-muted-foreground">
              Existing system must be operational and less than 25 years old (20 for heat pumps). Photos and model/serial numbers are required.
            </p>

            {/* Row 1: Age, Photos, Operational, Heat Type */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Existing System Age (years)</Label>
                <Input value={existingAge} onChange={(e) => setExistingAge(e.target.value)} type="number" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Photos Provided?</Label>
                <RadioGroup value={photosProvided} onValueChange={setPhotosProvided} className="flex gap-3">
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="yes" id="ph-yes" />
                    <Label htmlFor="ph-yes" className="text-sm">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="no" id="ph-no" />
                    <Label htmlFor="ph-no" className="text-sm">No</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Operational?</Label>
                <RadioGroup value={existingOperational} onValueChange={setExistingOperational} className="flex gap-3">
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="yes" id="op-yes" />
                    <Label htmlFor="op-yes" className="text-sm">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="no" id="op-no" />
                    <Label htmlFor="op-no" className="text-sm">No</Label>
                  </div>
                </RadioGroup>
              </div>
              {unitType === "heat_pump" && (
                <div className="space-y-2">
                  <Label className="text-xs">Existing Heat Type</Label>
                  <RadioGroup value={existingHeatType} onValueChange={setExistingHeatType} className="flex gap-3">
                    <div className="flex items-center space-x-1">
                      <RadioGroupItem value="electrical_resistance" id="ht-er" />
                      <Label htmlFor="ht-er" className="text-xs">Elec. Resistance</Label>
                    </div>
                    <div className="flex items-center space-x-1">
                      <RadioGroupItem value="air_source" id="ht-as" />
                      <Label htmlFor="ht-as" className="text-xs">Air Source HP</Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>

            {/* Systems 1-3 */}
            {existingSystems.map((sys, i) => {
              const hasData = sys.outdoorModel || sys.outdoorSerial || sys.indoorModel || sys.indoorSerial || sys.furnaceModel || sys.furnaceSerial;
              return (
                <div key={i} className={i > 0 ? "border-t pt-3 mt-3" : ""}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-foreground">Existing System {i + 1}</span>
                    {i > 0 && !hasData && <span className="text-xs text-muted-foreground">— N/A</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Outdoor Model Number</Label>
                      <Input value={sys.outdoorModel} onChange={(e) => updateSystem(i, "outdoorModel", e.target.value)} className="font-mono" placeholder={i > 0 ? "N/A" : ""} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Outdoor Serial Number</Label>
                      <Input value={sys.outdoorSerial} onChange={(e) => updateSystem(i, "outdoorSerial", e.target.value)} className="font-mono" placeholder={i > 0 ? "N/A" : ""} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Indoor Model Number</Label>
                      <Input value={sys.indoorModel} onChange={(e) => updateSystem(i, "indoorModel", e.target.value)} className="font-mono" placeholder={i > 0 ? "N/A" : ""} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Indoor Serial Number</Label>
                      <Input value={sys.indoorSerial} onChange={(e) => updateSystem(i, "indoorSerial", e.target.value)} className="font-mono" placeholder={i > 0 ? "N/A" : ""} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Furnace Model Number</Label>
                      <Input value={sys.furnaceModel} onChange={(e) => updateSystem(i, "furnaceModel", e.target.value)} className="font-mono" placeholder={i > 0 ? "N/A" : ""} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Furnace Serial Number</Label>
                      <Input value={sys.furnaceSerial} onChange={(e) => updateSystem(i, "furnaceSerial", e.target.value)} className="font-mono" placeholder={i > 0 ? "N/A" : ""} />
                    </div>
                  </div>
                </div>
              );
            })}

            {existingAge && parseInt(existingAge) >= (unitType === "heat_pump" ? 20 : 25) && (
              <div className="flex items-center gap-2 text-destructive text-xs">
                <AlertTriangle className="h-4 w-4" />
                System is {unitType === "heat_pump" ? "20" : "25"}+ years old — does not qualify for Early Replacement. Will be processed as Replace on Burnout.
              </div>
            )}
            {photosProvided === "no" && (
              <div className="flex items-center gap-2 text-destructive text-xs">
                <AlertTriangle className="h-4 w-4" />
                Photos of existing system are required for Early Replacement qualification.
              </div>
            )}
          </div>
        )}

        {/* Rebate Tier Reference */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="font-semibold text-sm text-foreground uppercase tracking-wide">
            CPS Rebate Tier Reference
          </h4>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 px-2 font-semibold">Tier</th>
                  <th className="text-left py-1.5 px-2 font-semibold">SEER2 Range</th>
                  <th className="text-right py-1.5 px-2 font-semibold">Early Replacement</th>
                  <th className="text-right py-1.5 px-2 font-semibold">Replace on Burnout</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((t) => {
                  const isActive = calc?.qualifies && (calc as any).tier === t.name;
                  return (
                    <tr key={t.name} className={cn("border-b", isActive && "bg-primary/10 font-semibold")}>
                      <td className="py-1.5 px-2">{t.name}</td>
                      <td className="py-1.5 px-2">{t.min} – {t.max === 99 ? "20.0+" : t.max}</td>
                      <td className="text-right py-1.5 px-2">${t.earlyPer}/ton</td>
                      <td className="text-right py-1.5 px-2">${t.burnoutPer}/ton</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Required documents checklist */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h4 className="font-semibold text-sm text-foreground uppercase tracking-wide">
            Required Documents Checklist
          </h4>
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" /> Itemized invoice (model/serial #s, install date, address, total cost)
            </li>
            <li className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" /> AHRI certificate or certificate number
            </li>
            {rebateType === "early_replacement" && (
              <li className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" /> Photos of existing system
              </li>
            )}
            <li className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" /> Permit information (City of San Antonio)
            </li>
          </ul>
          <p className="text-[10px] text-muted-foreground mt-2">
            Submit to: CPSEnergyResidential@clearesult.com · Must be received within 30 days of installation
          </p>
        </div>
      </div>
    </div>
  );
}
