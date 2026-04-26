import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { PaymentFlowCanvas } from "@/components/payment-flow/PaymentFlowCanvas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

function usePaymentFlowMetrics() {
  return useQuery({
    queryKey: ["payment_flow_metrics"],
    queryFn: async () => {
      const { data: invoices } = await supabase
        .from("customer_invoices")
        .select("id, status, total, sent_at, paid_at, created_at");

      const all = invoices || [];
      const draft = all.filter(i => i.status === "draft");
      const sent = all.filter(i => i.status === "sent");
      const paid = all.filter(i => i.status === "paid");
      const now = new Date();
      const overdue = sent.filter(i => {
        const sentDate = i.sent_at ? new Date(i.sent_at) : new Date(i.created_at);
        return differenceInDays(now, sentDate) >= 7;
      });

      return {
        draft: draft.length,
        draftAmt: draft.reduce((s, i) => s + (i.total || 0), 0),
        sent: sent.length,
        sentAmt: sent.reduce((s, i) => s + (i.total || 0), 0),
        paid: paid.length,
        paidAmt: paid.reduce((s, i) => s + (i.total || 0), 0),
        overdue: overdue.length,
        overdueAmt: overdue.reduce((s, i) => s + (i.total || 0), 0),
        failed: 0,
      };
    },
  });
}

export default function PaymentFlow() {
  const isMobile = useIsMobile();
  const { data: metrics, isLoading } = usePaymentFlowMetrics();

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/admin?tab=tools">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Payment Flow</h1>
            <p className="text-xs text-muted-foreground">Invoice-to-payment lifecycle with live dollar amounts.</p>
          </div>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>}
        {!isLoading && !metrics && (
          <div className="text-center py-16 space-y-3">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">No invoice data found. Create invoices from jobs to see the payment flow.</p>
          </div>
        )}
        {metrics && <PaymentFlowCanvas metrics={metrics} />}
      </main>
    </div>
  );
}
