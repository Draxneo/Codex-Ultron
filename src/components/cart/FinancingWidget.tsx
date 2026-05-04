import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, Sparkles } from "lucide-react";

interface Props {
  total: number;
  onApply?: () => void;
  compact?: boolean;
  financingDisclaimer?: string | null;
}

/**
 * Estimates a monthly payment using a simple amortization at a typical
 * home-improvement financing APR (9.99%) over 60 months. Used to make
 * large totals feel manageable on the customer cart page.
 */
function estimateMonthly(total: number, apr = 0.0999, months = 60): number {
  if (total <= 0) return 0;
  const r = apr / 12;
  return (total * r) / (1 - Math.pow(1 + r, -months));
}

export function FinancingWidget({ total, onApply, compact, financingDisclaimer }: Props) {
  if (total < 500) return null; // not worth showing on small tickets
  const monthly = estimateMonthly(total);

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-sm">
        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
          As low as ${monthly.toFixed(0)}/mo
        </span>
        {onApply && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700 dark:text-emerald-400" onClick={onApply}>
            Pre-qualify
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Financing available
          </p>
          <p className="text-2xl font-bold mt-0.5">
            ${monthly.toFixed(0)}<span className="text-sm font-normal text-muted-foreground">/mo</span>
          </p>
          {financingDisclaimer && (
            <p className="text-xs text-muted-foreground">
              {financingDisclaimer}
            </p>
          )}
          {onApply && (
            <Button size="sm" className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onApply}>
              Apply for Financing
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
