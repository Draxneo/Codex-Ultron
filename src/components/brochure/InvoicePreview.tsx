import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Download, Phone, Mail, MapPin, Shield, CheckCircle2, ExternalLink, ChevronDown } from "lucide-react";
import { useInvoicePreviewData } from "@/hooks/useInvoicePreviewData";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { format } from "date-fns";
import EquipmentDocBlocks from "@/components/invoice/EquipmentDocBlocks";
import CpsRebateBlock from "@/components/invoice/CpsRebateBlock";
import type { CpsRebateData } from "@/components/invoice/CpsRebateBlock";
import type { EquipmentDocsData } from "@/hooks/usePublicInvoice";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

const sampleInvoice = {
  invoice_number: "J-10247",
  created_at: new Date().toISOString(),
  status: "paid",
  subtotal: 8750,
  tax_rate: 8.25,
  tax_amount: 721.88,
  total: 9471.88,
  paid_at: new Date().toISOString(),
  notes: "Thank you for choosing us! All work includes our comprehensive labor warranty.",
  items: [
    { id: "1", description: "Trane XR16 — 3 Ton Heat Pump System", quantity: 1, unit_price: 6200, total: 6200, sort_order: 0 },
    { id: "2", description: "Installation Labor (Standard)", quantity: 1, unit_price: 1800, total: 1800, sort_order: 1 },
    { id: "3", description: "Wi-Fi Smart Thermostat Upgrade", quantity: 1, unit_price: 350, total: 350, sort_order: 2 },
    { id: "4", description: "Duct Sealing & Inspection", quantity: 1, unit_price: 400, total: 400, sort_order: 3 },
  ],
};

const sampleCustomer = {
  first_name: "Sarah",
  last_name: "Johnson",
  address: "4521 Oak Meadow Ln",
  city: "Austin",
  state: "TX",
  zip: "78745",
  email: "sarah.johnson@email.com",
  phone: "(512) 555-0147",
};

const sampleEquipmentDocs: EquipmentDocsData = {
  oldEquipment: [
    { id: "1", brand: "Carrier", model_number: "24ACC636A003", serial_number: "3216E12345", equipment_type: "HVAC", install_date: "2012-06-15" },
  ],
  newEquipment: [
    { id: "2", brand: "Trane", model_number: "4TWR6036J1000AA", serial_number: "2432A99876", source: "data_plate" },
    { id: "3", brand: "Trane", model_number: "TEM6A0C42H41SBA", serial_number: "2432B55432", source: "tech_form" },
  ],
  ahri: [
    { ahri_number: "210584321", seer2: 16.0, hspf2: null, eer2: 12.2, certificate_path: null, certificateUrl: "/placeholder.svg", outdoor_model: "4TWR6036J1000AA", indoor_model: "TEM6A0C42H41SBA", furnace_model: null, energy_star: true },
  ],
  photos: [
    { id: "p1", url: "/placeholder.svg", photoType: "before" },
    { id: "p2", url: "/placeholder.svg", photoType: "before" },
    { id: "p3", url: "/placeholder.svg", photoType: "after" },
    { id: "p4", url: "/placeholder.svg", photoType: "after" },
    { id: "p5", url: "/placeholder.svg", photoType: "data_plate" },
  ],
  certificates: [
    { id: "c1", certificate_type: "manufacturer_warranty", token: "sample-mfr" },
    { id: "c2", certificate_type: "labor_warranty", token: "sample-labor" },
    { id: "c3", certificate_type: "no_lemon", token: "sample-lemon" },
  ],
};

const sampleApprovedEstimate = {
  selectedTier: "Silver",
  selectedAddons: [{ name: "Wi-Fi Thermostat" }, { name: "Surge Protector" }],
  paymentPreference: "financing",
  presentationToken: "sample-token",
};

const sampleCpsRebate: CpsRebateData = {
  qualifies: true,
  tierName: "Tier 3",
  earlyRebate: 525,
  burnoutRebate: 450,
  seer2: 16.0,
  eer2: 12.2,
  hspf2: null,
  ahriNumber: "210584321",
  tonnage: 3,
  condenserModel: "4TWR6036J1000AA",
  coilModel: "TEM6A0C42H41SBA",
  furnaceModel: null,
  rebateUrl: "https://www.cpsenergy.com/en/my-home/savenow/rebates-incentives/cooling-heating.html",
};

const fmt = (n: number) => `$${n.toFixed(2)}`;

const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-muted text-muted-foreground", text: "text-muted-foreground", label: "DRAFT" },
  sent: { bg: "bg-sky-100 text-sky-700", text: "text-sky-700", label: "AWAITING PAYMENT" },
  paid: { bg: "bg-emerald-100 text-emerald-700", text: "text-emerald-700", label: "PAID" },
  void: { bg: "bg-destructive/10 text-destructive", text: "text-destructive", label: "VOID" },
};

const BLOCK_LIST = [
  "Company Header", "Invoice Meta", "Bill To", "Line Items", "Totals",
  "Approved Estimate", "Equipment Removed", "Before Photos",
  "Equipment Installed", "After Photos", "Data Plates",
  "AHRI Certificates", "Warranty Certs", "CPS Rebate",
  "Notes", "Pay / Print", "Footer",
];

interface InvoicePreviewProps {
  invoiceId?: string;
  jobId?: string;
}

export default function InvoicePreview({ invoiceId, jobId }: InvoicePreviewProps) {
  const { data: liveData, isLoading } = useInvoicePreviewData(
    invoiceId || jobId ? { invoiceId, jobId } : undefined
  );
  const useLive = !!(invoiceId || jobId) && !!liveData;
  const [blockMapOpen, setBlockMapOpen] = useState(false);

  if ((invoiceId || jobId) && isLoading) {
    return <LoadingSpinner label="Loading invoice…" />;
  }

  const invoice = useLive
    ? {
        invoice_number: liveData.invoice_number,
        created_at: liveData.created_at,
        status: liveData.status,
        subtotal: liveData.subtotal,
        tax_rate: liveData.tax_rate,
        tax_amount: liveData.tax_amount,
        total: liveData.total,
        notes: liveData.notes || "",
        items: liveData.items,
        paid_at: liveData.paid_at,
      }
    : sampleInvoice;

  const customer = useLive ? liveData.customer : sampleCustomer;
  const companyName = useLive ? liveData.companyName : DEFAULT_COMPANY_NAME;
  const companyPhone = useLive ? liveData.companyPhone : "(512) 555-0100";
  const companyEmail = useLive ? liveData.companyEmail : "info@yourhvac.com";
  const companyAddress = useLive ? liveData.companyAddress : "123 Main St, Austin, TX 78701";
  const companyLicense = useLive ? liveData.companyLicense : "TACLA#12345";
  const equipDocs = useLive ? liveData.equipmentDocs : sampleEquipmentDocs;
  const cpsRebateData = useLive ? liveData.cpsRebate : sampleCpsRebate;
  const approvedEstimate = useLive ? (liveData as any).approvedEstimate : sampleApprovedEstimate;

  const status = statusStyle[invoice.status] || statusStyle.sent;
  const dateStr = (() => {
    try { return format(new Date(invoice.created_at), "MMMM d, yyyy"); } catch { return "—"; }
  })();
  const paidDateStr = (() => {
    try { return (invoice as any).paid_at ? format(new Date((invoice as any).paid_at), "MMMM d, yyyy") : null; } catch { return null; }
  })();

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-lg bg-muted">
      <p className="text-xs text-muted-foreground text-center py-2 bg-muted/80 border-b border-border">
        ▾ Live Preview — {useLive ? "Real Invoice Data" : "Sample Data (All Blocks)"}
      </p>

      {/* Block Map Legend */}
      {!useLive && (
        <Collapsible open={blockMapOpen} onOpenChange={setBlockMapOpen}>
          <CollapsibleTrigger className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-b border-border bg-muted/40">
            <ChevronDown className={`h-3 w-3 transition-transform ${blockMapOpen ? "rotate-180" : ""}`} />
            Block Map ({BLOCK_LIST.length} blocks)
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-1.5 px-4 py-2 bg-muted/40 border-b border-border">
              {BLOCK_LIST.map((b) => (
                <span key={b} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                  <CheckCircle2 className="h-2.5 w-2.5" /> {b}
                </span>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Header Bar */}
      <div className="bg-primary text-primary-foreground">
        <div className="px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{companyName}</h1>
            {companyLicense && (
              <p className="text-primary-foreground/70 text-sm mt-1 flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" /> {companyLicense}
              </p>
            )}
          </div>
          <div className="text-right text-sm text-primary-foreground/80 space-y-0.5">
            {companyPhone && <p className="flex items-center gap-1.5 justify-end"><Phone className="h-3.5 w-3.5" /> {companyPhone}</p>}
            {companyEmail && <p className="flex items-center gap-1.5 justify-end"><Mail className="h-3.5 w-3.5" /> {companyEmail}</p>}
            {companyAddress && <p className="flex items-center gap-1.5 justify-end"><MapPin className="h-3.5 w-3.5" /> {companyAddress}</p>}
          </div>
        </div>
      </div>

      <div className="h-1.5 bg-accent" />

      <div className="px-6 py-8 bg-background">
        {/* Invoice meta */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Invoice</p>
            <p className="text-2xl font-bold text-foreground mt-1">{invoice.invoice_number}</p>
            <p className="text-sm text-muted-foreground mt-1">{dateStr}</p>
            {paidDateStr && (
              <p className="text-xs text-emerald-600 font-medium mt-1">Paid on {paidDateStr}</p>
            )}
          </div>
          <Badge className={`${status.bg} ${status.text} text-xs px-3 py-1 font-bold border-0`}>
            {status.label}
          </Badge>
        </div>

        {/* Bill To */}
        <div className="mb-8 p-4 rounded-lg bg-card border border-border">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Bill To</p>
          <p className="font-semibold text-foreground">{customer.first_name} {customer.last_name}</p>
          <p className="text-sm text-muted-foreground">
            {[customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ")}
          </p>
          {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
          {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
        </div>

        {/* Line Items */}
        <div className="rounded-lg border border-border overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th className="text-left px-4 py-3 font-semibold">Description</th>
                <th className="text-center px-4 py-3 font-semibold w-20">Qty</th>
                <th className="text-right px-4 py-3 font-semibold w-28">Unit Price</th>
                <th className="text-right px-4 py-3 font-semibold w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? "bg-card" : "bg-muted/50"}>
                  <td className="px-4 py-3 text-foreground">{item.description}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">{fmt(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax ({invoice.tax_rate}%)</span>
              <span className="text-foreground">{fmt(invoice.tax_amount)}</span>
            </div>
            <div className="h-0.5 bg-accent rounded-full" />
            <div className="flex justify-between text-lg font-bold">
              <span className="text-foreground">Total Due</span>
              <span className="text-accent">{fmt(invoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Approved Estimate Summary */}
        {approvedEstimate && (
          <div className="mb-8 p-4 rounded-lg bg-accent/10 border border-accent/20">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-foreground">Approved Estimate Summary</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              {approvedEstimate.selectedTier && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Selected System</p>
                  <p className="font-medium text-foreground">{approvedEstimate.selectedTier} Tier</p>
                </div>
              )}
              {approvedEstimate.selectedAddons && Array.isArray(approvedEstimate.selectedAddons) && approvedEstimate.selectedAddons.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Add-Ons</p>
                  <p className="font-medium text-foreground">
                    {approvedEstimate.selectedAddons.map((a: any) => typeof a === "string" ? a : a.name).join(", ")}
                  </p>
                </div>
              )}
              {approvedEstimate.paymentPreference && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Payment</p>
                  <p className="font-medium text-foreground capitalize">{approvedEstimate.paymentPreference}</p>
                </div>
              )}
            </div>
            {approvedEstimate.presentationToken && (
              <div className="mt-3">
                <span className="text-xs text-accent flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> View Full Estimate
                </span>
              </div>
            )}
          </div>
        )}

        {/* Equipment Documentation */}
        {equipDocs && <EquipmentDocBlocks docs={equipDocs} />}

        {/* CPS Energy Rebate */}
        {cpsRebateData && <CpsRebateBlock data={cpsRebateData} />}

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-8 p-4 rounded-lg bg-accent/10 border border-accent/20">
            <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-1">Notes</p>
            <p className="text-sm text-foreground">{invoice.notes}</p>
          </div>
        )}

        {/* Pay Button — hide for $0 complimentary invoices */}
        {invoice.total > 0 ? (
          <div className="flex justify-center">
            <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-base px-10 py-6 shadow-lg" disabled>
              <CreditCard className="h-5 w-5 mr-2" />
              Pay {fmt(invoice.total)} Now
            </Button>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-6 py-4 text-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-sm font-semibold text-emerald-700">Complimentary Service — No Payment Due</p>
              <p className="text-xs text-emerald-600 mt-0.5">Thank you for choosing us!</p>
            </div>
          </div>
        )}

        <div className="flex justify-center mt-4">
          <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
            <Download className="h-4 w-4 mr-1" /> Print / Save PDF
          </Button>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground space-y-1">
          <p className="font-semibold">{companyName}</p>
          {companyLicense && <p>Licensed & Insured · {companyLicense}</p>}
          <p>Thank you for your business!</p>
        </div>
      </div>
    </div>
  );
}
