import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PricingCheatSheetSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>📋 Pricing Cheat Sheet</SheetTitle>
          <SheetDescription>How each price line is calculated and when to use it.</SheetDescription>
        </SheetHeader>

        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="font-semibold text-primary">Low Margin Price</dt>
            <dd className="mt-1 text-muted-foreground">
              The absolute floor — equipment + materials + labor + profit + tax. No finance markup. The lowest we can go on a credit-card / same-day-close deal without losing money.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Financed Price</dt>
            <dd className="mt-1 text-muted-foreground">
              Low Margin Price + the finance surcharge. This is the sticker price the customer sees on the proposal — also the base for both monthly-payment calculations.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Monthly Payment — 0% APR · 36 Months</dt>
            <dd className="mt-1 text-muted-foreground">
              Financed Price × <strong>0.0278</strong>. Same-as-cash promo with no interest if paid in 36 months. Shown as Option A on the proposal.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Monthly Payment — 9.99% APR · 120 Months (Plan 943)</dt>
            <dd className="mt-1 text-muted-foreground">
              Financed Price × <strong>0.0125</strong>. Long-term financing — lowest monthly payment of the three options. Shown as Option B on the proposal.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Instant Factory Rebate</dt>
            <dd className="mt-1 text-muted-foreground">
              Financed Price minus the factory rebate amount = the one-time price the customer pays today (cash, check, or credit card — all settle option C the same way). The manufacturer rebate is passed through to the customer as a discount instead of monthly financing. Shown as Option C on the proposal.
            </dd>
          </div>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              The customer picks ONE — not combined.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              0% / 36 mo OR 9.99% / 120 mo OR Instant Factory Rebate. These three options are mutually exclusive.
            </p>
          </div>

          <div>
            <dt className="font-semibold text-primary">Materials Fee</dt>
            <dd className="mt-1 text-muted-foreground">
              Whip kits, line sets, copper, refrigerant, condensate pumps, electrical, drywall — anything that isn't the box itself. Charged once per system.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Labor Fee</dt>
            <dd className="mt-1 text-muted-foreground">
              Crew labor for the install — typically a flat per-system fee that already includes the standard removal + reinstall scope.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Profit Fee</dt>
            <dd className="mt-1 text-muted-foreground">
              Our gross profit target baked into the Low Margin Price. Tier-aware — Better/Best/Ultimate carry higher targets.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Tax %</dt>
            <dd className="mt-1 text-muted-foreground">
              Sales tax applied to (equipment + materials + labor + profit). Default 8.25% (San Antonio). Override per brand/tier for jurisdictions that differ.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Finance %</dt>
            <dd className="mt-1 text-muted-foreground">
              Markup added to Low Margin Price to cover the finance company's dealer fee. Default 16% — adjust if a finance partner changes their fee schedule.
            </dd>
          </div>

          <div>
            <dt className="font-semibold text-primary">Factory Rebate $</dt>
            <dd className="mt-1 text-muted-foreground">
              Per-brand, per-tier rebate from the manufacturer. Set to $0 for tiers without a rebate. Only applies to the Instant Factory Rebate option (option C).
            </dd>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3 mt-6">
            <p className="font-semibold text-foreground mb-1">Inheritance order</p>
            <p className="text-xs text-muted-foreground">
              When pricing a quote, the system looks up formulas in this order: <strong>Brand+Tier</strong> → <strong>Brand default</strong> → <strong>Global Tier default</strong> → <strong>Global default</strong>. An empty cell means it inherits from the next level up.
            </p>
          </div>
        </dl>
      </SheetContent>
    </Sheet>
  );
}
