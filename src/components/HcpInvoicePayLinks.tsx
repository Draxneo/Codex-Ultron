import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Send, Copy, Receipt, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Props = {
  hcpJobId: string | null | undefined;
  jobId: string;
  customerName?: string;
  customerPhone?: string;
};

type HcpInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  amount: number;
  due_amount: number;
  paid_at: string | null;
  sent_at: string | null;
  invoice_date: string | null;
  pay_url?: string | null;
};

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const cleanId = (id: string) => id.replace(/^(invoice_|inv_)/i, "").replace(/-/g, "");

const fallbackPayUrl = (id: string) => `https://client.housecallpro.com/invoices/${cleanId(id)}`;

const getPayUrl = (invoice: HcpInvoice) => invoice.pay_url || fallbackPayUrl(invoice.id);

const statusColor: Record<string, string> = {
  paid: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  open: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  pending_payment: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  voided: "bg-muted text-muted-foreground border-border",
  canceled: "bg-muted text-muted-foreground border-border",
  uncollectible: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function HcpInvoicePayLinks({ hcpJobId, jobId, customerName, customerPhone }: Props) {
  const [sending, setSending] = useState<string | null>(null);

  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ["hcp-job-invoices", hcpJobId],
    queryFn: async (): Promise<HcpInvoice[]> => {
      if (!hcpJobId) return [];
      const { data, error } = await supabase.functions.invoke("hcp-list-job-invoices", {
        body: { hcp_job_id: hcpJobId },
      });
      if (error) throw new Error(error.message);
      return data?.invoices || [];
    },
    enabled: !!hcpJobId,
    staleTime: 60_000,
  });

  if (!hcpJobId) return null;

  const handleText = async (inv: HcpInvoice) => {
    if (!customerPhone) {
      toast({ title: "No phone number", description: "Customer has no phone on file.", variant: "destructive" });
      return;
    }
    setSending(inv.id);
    const { data, error } = await supabase.functions.invoke("hcp-text-invoice", {
      body: {
        hcp_invoice_id: inv.id,
        hcp_pay_url: getPayUrl(inv),
        to: customerPhone,
        customer_name: customerName,
        job_id: jobId,
      },
    });
    setSending(null);
    if (error || data?.error) {
      toast({ title: "Failed to text invoice", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Invoice link sent", description: `Texted to ${customerPhone}` });
  };

  const handleCopy = async (inv: HcpInvoice) => {
    const url = getPayUrl(inv);
    await navigator.clipboard.writeText(url);
    toast({ title: "Pay link copied" });
  };

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="py-3 px-4 bg-primary/5">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Receipt className="h-4 w-4" /> HCP Invoices (Pay Link)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading from HCP…
          </div>
        )}
        {error && (
          <p className="text-xs text-destructive">Failed to load HCP invoices: {(error as Error).message}</p>
        )}
        {!isLoading && invoices && invoices.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No HCP invoices for this job yet.</p>
        )}
        {invoices?.map((inv) => {
          const payUrl = getPayUrl(inv);
          const isPaid = inv.status === "paid";
          return (
            <div key={inv.id} className="border rounded-md p-3 space-y-2 bg-background">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold">#{inv.invoice_number}</span>
                  <Badge variant="outline" className={cn("text-[10px]", statusColor[inv.status] || statusColor.open)}>
                    {inv.status.replace("_", " ").toUpperCase()}
                  </Badge>
                </div>
                <div className="text-sm font-bold tabular-nums">
                  {isPaid ? fmt(inv.amount) : fmt(inv.due_amount || inv.amount)}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {inv.invoice_date && <>Dated {format(new Date(inv.invoice_date), "M/d/yyyy")}</>}
                {inv.sent_at && <> · Sent {format(new Date(inv.sent_at), "M/d")}</>}
                {inv.paid_at && <> · Paid {format(new Date(inv.paid_at), "M/d")}</>}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {!isPaid && customerPhone && (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={sending === inv.id}
                    onClick={() => handleText(inv)}
                  >
                    {sending === inv.id ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Sending…</>
                    ) : (
                      <><Send className="h-3 w-3 mr-1" /> Text Pay Link</>
                    )}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleCopy(inv)}>
                  <Copy className="h-3 w-3 mr-1" /> Copy Link
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                  <a href={payUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" /> Preview
                  </a>
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
