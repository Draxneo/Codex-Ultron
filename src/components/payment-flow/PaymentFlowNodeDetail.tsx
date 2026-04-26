import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";
import { ExternalLink, DollarSign, AlertTriangle, CheckCircle, Clock, CreditCard, RefreshCw } from "lucide-react";

interface Props {
  stage: { id: string; label: string; count: number; amount: number; description: string } | null;
  open: boolean;
  onClose: () => void;
}

const STAGE_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  tips: string[];
  link?: { label: string; to: string };
}> = {
  draft: {
    icon: Clock,
    color: "text-muted-foreground",
    tips: ["Invoices created but not yet sent to the customer.", "Review line items and totals before sending."],
    link: { label: "View Draft Invoices", to: "/payments" },
  },
  sent: {
    icon: DollarSign,
    color: "text-blue-600",
    tips: ["Invoices sent and awaiting customer payment.", "Customers can pay online via the payment link."],
    link: { label: "View Sent Invoices", to: "/payments" },
  },
  overdue: {
    icon: AlertTriangle,
    color: "text-amber-600",
    tips: ["Invoices past their expected payment date.", "Auto-reminders can be configured in Sequence Builder."],
    link: { label: "View Overdue Invoices", to: "/payments" },
  },
  paid: {
    icon: CheckCircle,
    color: "text-emerald-600",
    tips: ["Successfully collected payments.", "Receipts are auto-emailed to customers."],
    link: { label: "View Payment History", to: "/payments" },
  },
  failed: {
    icon: RefreshCw,
    color: "text-destructive",
    tips: ["Payment attempts that failed or were declined.", "Retry or reach out to the customer for an alternative payment method."],
    link: { label: "View Failed Payments", to: "/payments" },
  },
  deposit: {
    icon: CreditCard,
    color: "text-primary",
    tips: ["Deposit invoices collected before work begins.", "Deposit amounts are configured per job type."],
  },
};

export function PaymentFlowNodeDetail({ stage, open, onClose }: Props) {
  if (!stage) return null;

  const cfg = STAGE_CONFIG[stage.id] || { icon: DollarSign, color: "text-muted-foreground", tips: [] as string[], link: undefined as { label: string; to: string } | undefined };
  const Icon = cfg.icon;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className={`h-4 w-4 ${cfg.color}`} />
            </div>
            <SheetTitle className="text-base">{stage.label}</SheetTitle>
          </div>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{stage.count} invoices</Badge>
            {stage.amount > 0 && (
              <Badge variant="outline" className="text-emerald-600">${stage.amount.toLocaleString()}</Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">{stage.description}</p>

          {cfg.tips.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                {cfg.tips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">•</span>
                    <span className="text-muted-foreground">{tip}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {cfg.link && (
            <>
              <Separator />
              <Link to={cfg.link.to}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
                  <ExternalLink className="h-3 w-3" /> {cfg.link.label}
                </Button>
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
