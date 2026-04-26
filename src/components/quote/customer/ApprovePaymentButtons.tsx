import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { RenderedQuote } from "@/lib/quoteTemplate";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import { useApproveQuickQuote } from "@/hooks/useQuickQuoteLinks";

interface Props {
  token: string;
  matchup: EquipmentMatchup;
  rendered: RenderedQuote | null;
  approvedOption?: "A" | "B" | "C" | null;
}

const fmt = (n: number | null | undefined) =>
  n == null ? "TBD" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtWhole = (n: number | null | undefined) =>
  n == null ? "TBD" : `$${Math.round(n).toLocaleString()}`;

export function ApprovePaymentButtons({ token, matchup, rendered, approvedOption }: Props) {
  const approve = useApproveQuickQuote();
  const [pending, setPending] = useState<"A" | "B" | "C" | null>(null);

  const financed = rendered?.financedPrice ?? matchup.total_price ?? null;
  const monthly36 = rendered?.monthlyPayment36 ?? matchup.monthly_payment ?? null;
  const monthly120 = rendered?.monthlyPayment120 ?? (matchup as any).monthly_payment_120 ?? null;
  const rebatePrice = matchup.factory_rebate_price ?? financed;
  const savings = financed != null && rebatePrice != null && financed > rebatePrice ? financed - rebatePrice : 0;

  const handleConfirm = async () => {
    if (!pending) return;
    await approve.mutateAsync({ token, option: pending });
    setPending(null);
  };

  const isApproved = !!approvedOption;
  const optionLabel = (o: "A" | "B" | "C") =>
    o === "A" ? `Option A — 0% APR · 36 mo · ${fmt(monthly36)}/mo`
      : o === "B" ? `Option B — 9.99% APR · 120 mo · ${fmt(monthly120)}/mo`
      : `Option C — Instant Rebate · ${fmt(rebatePrice)}`;

  return (
    <Card className="p-6 md:p-8 border-2 border-primary/30 shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">💳</span>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Your Investment</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Choose one — tap to approve.</p>

      {isApproved && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <span className="font-medium text-foreground">
            You approved {approvedOption === "A" ? "Option A" : approvedOption === "B" ? "Option B" : "Option C"}.
            We'll be in touch shortly.
          </span>
        </div>
      )}

      <div className="grid gap-3">
        {/* Option A */}
        <button
          disabled={isApproved}
          onClick={() => setPending("A")}
          className={`text-left rounded-xl border-2 p-4 transition-all ${
            approvedOption === "A"
              ? "border-success bg-success/10"
              : "border-border hover:border-primary hover:bg-primary/5 disabled:opacity-50"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Option A</p>
              <p className="text-base md:text-lg font-bold text-foreground mt-0.5">0% APR · 36 Months</p>
              <p className="text-2xl md:text-3xl font-extrabold text-foreground mt-1">{fmt(monthly36)}<span className="text-sm font-medium text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmt(financed)} financed</p>
            </div>
            <div className="shrink-0 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm md:text-base">
              APPROVE A
            </div>
          </div>
        </button>

        {/* Option B */}
        <button
          disabled={isApproved}
          onClick={() => setPending("B")}
          className={`text-left rounded-xl border-2 p-4 transition-all relative ${
            approvedOption === "B"
              ? "border-success bg-success/10"
              : "border-border hover:border-primary hover:bg-primary/5 disabled:opacity-50"
          }`}
        >
          <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold uppercase tracking-wider">
            ★ Lowest Monthly
          </span>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Option B</p>
              <p className="text-base md:text-lg font-bold text-foreground mt-0.5">9.99% APR · 120 Months</p>
              <p className="text-2xl md:text-3xl font-extrabold text-foreground mt-1">{fmt(monthly120)}<span className="text-sm font-medium text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmt(financed)} financed</p>
            </div>
            <div className="shrink-0 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm md:text-base">
              APPROVE B
            </div>
          </div>
        </button>

        {/* Option C */}
        <button
          disabled={isApproved}
          onClick={() => setPending("C")}
          className={`text-left rounded-xl border-2 p-4 transition-all relative ${
            approvedOption === "C"
              ? "border-success bg-success/10"
              : "border-border hover:border-primary hover:bg-primary/5 disabled:opacity-50"
          }`}
        >
          <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-success text-success-foreground text-[10px] font-bold uppercase tracking-wider">
            ★ Best Price
          </span>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Option C</p>
              <p className="text-base md:text-lg font-bold text-foreground mt-0.5">Instant Factory Rebate</p>
              <p className="text-2xl md:text-3xl font-extrabold text-foreground mt-1">{fmt(rebatePrice)}<span className="text-sm font-medium text-muted-foreground"> one-time</span></p>
              {savings > 0 && (
                <p className="text-xs text-success font-semibold mt-0.5">Save {fmtWhole(savings)} vs. financed</p>
              )}
            </div>
            <div className="shrink-0 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-sm md:text-base">
              APPROVE C
            </div>
          </div>
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center mt-4">
        Financing through Synchrony Bank · No prepayment penalty · Subject to credit approval
      </p>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your selection</AlertDialogTitle>
            <AlertDialogDescription>
              You're approving: <strong className="text-foreground">{pending && optionLabel(pending)}</strong>.
              <br /><br />
              This sends your approval to our team — we'll contact you to schedule and finalize paperwork.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approve.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={approve.isPending}>
              {approve.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Yes, approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
