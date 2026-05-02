import { useParams } from "react-router-dom";
import { usePublicInvoice } from "@/hooks/usePublicInvoice";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Download, Phone, Mail, MapPin, Shield, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react";
import EquipmentDocBlocks from "@/components/invoice/EquipmentDocBlocks";
import CpsRebateBlock from "@/components/invoice/CpsRebateBlock";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";
import { errorMessage } from "@/lib/errorMessage";

const fmt = (n: number) => `$${n.toFixed(2)}`;

const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-muted", text: "text-muted-foreground", label: "DRAFT" },
  sent: { bg: "bg-sky-light text-sky", text: "text-sky", label: "AWAITING PAYMENT" },
  paid: { bg: "bg-emerald-100 text-emerald-700", text: "text-emerald-700", label: "PAID" },
  void: { bg: "bg-destructive/10", text: "text-destructive", label: "VOID" },
};

export default function InvoicePublic() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = usePublicInvoice(token);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Skeleton className="w-96 h-64" />
      </div>
    );
  }

  if (error || !data?.invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <p className="text-muted-foreground text-lg">Invoice not found.</p>
      </div>
    );
  }

  const { invoice, job, companySettings: cs, approvedEstimate, equipmentDocs, cpsRebate } = data;
  const customer = job?.customers;
  const items = invoice.customer_invoice_items || [];
  const status = statusStyle[invoice.status] || statusStyle.draft;

  const handlePay = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const { data: checkout, error: err } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          type: "invoice",
          invoice_id: invoice.id,
          amount: invoice.total,
          customer_name: customer ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim() : undefined,
          customer_email: customer?.email,
          payment_plan_count: 1,
          success_url: `${window.location.origin}/invoice/${token}?paid=true`,
          cancel_url: `${window.location.origin}/invoice/${token}`,
        },
      });
      if (err) throw err;
      if (!checkout?.url) throw new Error("The payment link was not returned.");
      window.location.href = checkout.url;
    } catch (err) {
      setPayError(errorMessage(err));
    }
    setPaying(false);
  };

  return (
    <div className="min-h-screen bg-muted print:bg-white">
      {/* Header Bar */}
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            {cs.company_logo_url && (
              <img
                src={cs.company_logo_url}
                alt={cs.company_name || DEFAULT_COMPANY_NAME}
                className="mb-3 h-14 max-w-[180px] rounded bg-white object-contain p-1"
              />
            )}
            <h1 className="text-2xl font-bold tracking-tight">
              {cs.company_name || DEFAULT_COMPANY_NAME}
            </h1>
            {cs.tacla_number && (
              <p className="text-primary-foreground/70 text-sm mt-1 flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                TACLA#{cs.tacla_number}
              </p>
            )}
          </div>
          <div className="text-right text-sm text-primary-foreground/80 space-y-0.5">
            {cs.company_phone && (
              <p className="flex items-center gap-1.5 justify-end">
                <Phone className="h-3.5 w-3.5" /> {cs.company_phone}
              </p>
            )}
            {cs.company_email && (
              <p className="flex items-center gap-1.5 justify-end">
                <Mail className="h-3.5 w-3.5" /> {cs.company_email}
              </p>
            )}
            {cs.company_address && (
              <p className="flex items-center gap-1.5 justify-end">
                <MapPin className="h-3.5 w-3.5" />
                {cs.company_address}{cs.company_city ? `, ${cs.company_city}` : ""}{cs.company_state ? `, ${cs.company_state}` : ""} {cs.company_zip || ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Gold accent divider */}
      <div className="h-1.5 bg-accent" />

      {/* Invoice Body */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Invoice meta */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Invoice</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {invoice.invoice_number || "-"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(invoice.created_at), "MMMM d, yyyy")}
            </p>
          </div>

          <div className="text-right">
            <Badge className={`${status.bg} ${status.text} text-xs px-3 py-1 font-bold border-0`}>
              {status.label}
            </Badge>
            {invoice.paid_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Paid {format(new Date(invoice.paid_at), "MMMM d, yyyy")}
              </p>
            )}
          </div>
        </div>

        {/* Bill To */}
        {customer && (
          <div className="mb-8 p-4 rounded-lg bg-card border border-border">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Bill To</p>
            <p className="font-semibold text-foreground">
              {customer.first_name} {customer.last_name}
            </p>
            {customer.address && (
              <p className="text-sm text-muted-foreground">
                {customer.address}{customer.city ? `, ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""} {customer.zip || ""}
              </p>
            )}
            {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
            {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
          </div>
        )}

        {/* Line Items Table */}
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
              {items
                .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
                .map((item: any, idx: number) => (
                  <tr
                    key={item.id}
                    className={idx % 2 === 0 ? "bg-card" : "bg-muted/50"}
                  >
                    <td className="px-4 py-3 text-foreground">{item.description}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmt(item.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{fmt(item.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Approved Estimate Summary */}
        {approvedEstimate && (
          <div className="mb-6 p-4 rounded-lg bg-accent/10 border border-accent/20">
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
                <Link
                  to={`/presentation/${approvedEstimate.presentationToken}`}
                  className="text-xs text-accent flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View Full Estimate
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">{fmt(invoice.subtotal)}</span>
            </div>
            {invoice.tax_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({invoice.tax_rate}%)</span>
                <span className="text-foreground">{fmt(invoice.tax_amount)}</span>
              </div>
            )}
            <div className="h-0.5 bg-accent rounded-full" />
            <div className="flex justify-between text-lg font-bold">
              <span className="text-foreground">Total Due</span>
              <span className="text-accent">{fmt(invoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Equipment Documentation Blocks */}
        {equipmentDocs && <EquipmentDocBlocks docs={equipmentDocs} baseUrl={window.location.origin} />}

        {/* CPS Energy Rebate Block */}
        {cpsRebate && <CpsRebateBlock data={cpsRebate} />}

        {/* Notes */}
        {invoice.notes && (
          <div className="mb-8 p-4 rounded-lg bg-accent/10 border border-accent/20">
            <p className="text-xs uppercase tracking-widest text-accent font-semibold mb-1">Notes</p>
            <p className="text-sm text-foreground">{invoice.notes}</p>
          </div>
        )}

        {/* Pay button, or complimentary banner for $0 */}
        {invoice.status !== "paid" && invoice.status !== "void" && invoice.total > 0 && (
          <div className="print:hidden">
            {payError && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Payment link did not open.</p>
                    <p>Please call Carnes and Sons Air Conditioning so we can help finish this invoice.</p>
                    <p className="mt-1 text-xs opacity-80">{payError}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-center">
              <Button
                size="lg"
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-base px-10 py-6 shadow-lg"
                onClick={handlePay}
                disabled={paying}
              >
                <CreditCard className="h-5 w-5 mr-2" />
                {paying ? "Processing..." : `Pay ${fmt(invoice.total)} Now`}
              </Button>
            </div>
          </div>
        )}
        {invoice.total === 0 && invoice.status !== "paid" && (
          <div className="flex justify-center print:hidden">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-6 py-4 text-center">
              <p className="text-sm font-semibold text-emerald-700">Complimentary Service - No Payment Due</p>
              <p className="text-xs text-emerald-600 mt-0.5">Thank you for choosing us!</p>
            </div>
          </div>
        )}

        {/* Print button */}
        <div className="flex justify-center mt-4 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => window.print()} className="text-muted-foreground">
            <Download className="h-4 w-4 mr-1" /> Print / Save PDF
          </Button>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border text-center text-xs text-muted-foreground space-y-1">
          <p className="font-semibold">{cs.company_name || DEFAULT_COMPANY_NAME}</p>
          {cs.tacla_number && <p>Licensed & Insured - TACLA#{cs.tacla_number}</p>}
          <p>Thank you for your business!</p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
        }
      `}</style>
    </div>
  );
}
