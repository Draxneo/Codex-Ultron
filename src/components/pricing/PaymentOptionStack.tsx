/**
 * PaymentOptionStack — Universal A/B/C three-option payment display.
 *
 * Renders the three mutually-exclusive system-purchase payment options as a
 * clearly-labeled vertical stack so customers and closers immediately
 * understand they pick ONE — not stack them as discounts.
 *
 *   Ⓐ  0% APR · 36 Months         (monthly headline)
 *   Ⓑ  9.99% APR · 120 Months     (monthly headline · ★ LOWEST MO)
 *   Ⓒ  Instant Factory Rebate     (one-time price · ★ BEST $ · save vs financed)
 *
 * Use anywhere we surface a financed-vs-rebate price set so the framing
 * stays identical across QuickQuote, JARVIS, presentations, etc.
 */

import { cn } from "@/lib/utils";
import { Banknote, CreditCard, FileText } from "lucide-react";

export interface PaymentOptionStackProps {
  financed: number;
  monthly36: number;
  monthly120: number;
  rebatePrice: number;
  className?: string;
  /** Compact variant for tight cards (smaller text + padding). */
  compact?: boolean;
  financingDisclaimer?: string | null;
}

function fmtMoney(n: number, withCents = true): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  })}`;
}

function OptionBadge({ letter, tone }: { letter: "A" | "B" | "C"; tone: "popular" | "lowest" | "best" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-black shrink-0 shadow-md ring-2 ring-background",
        tone === "popular" && "bg-warning text-warning-foreground",
        tone === "lowest" && "bg-primary text-primary-foreground",
        tone === "best" && "bg-success text-success-foreground"
      )}
    >
      {letter}
    </span>
  );
}

function StarTag({ children, tone }: { children: React.ReactNode; tone: "lowest" | "best" | "popular" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shadow-sm",
        tone === "lowest" && "bg-primary text-primary-foreground",
        tone === "best" && "bg-success text-success-foreground",
        tone === "popular" && "bg-warning text-warning-foreground"
      )}
    >
      ★ {children}
    </span>
  );
}

export function PaymentOptionStack({
  financed,
  monthly36,
  monthly120,
  rebatePrice,
  className,
  compact = false,
  financingDisclaimer,
}: PaymentOptionStackProps) {
  const savingsVsFinanced = Math.max(0, financed - rebatePrice);

  return (
    <div className={cn("rounded-xl border border-border bg-background overflow-hidden shadow-sm", className)}>
      {/* System sticker price (financed) — anchor for A & B */}
      <div className={cn(
        "bg-gradient-to-r from-muted/60 to-muted/30 border-b border-border px-3 py-2 flex items-baseline justify-between gap-2",
        compact && "py-1.5"
      )}>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          System Price (Financed)
        </span>
        <span className={cn("font-bold text-foreground", compact ? "text-base" : "text-lg")}>
          {fmtMoney(financed)}
        </span>
      </div>

      <div className={cn(
        "bg-gradient-to-r from-primary/10 via-primary/5 to-success/10 border-b border-border px-3 py-2",
        compact && "py-1.5"
      )}>
        <div className="text-[11px] font-black uppercase tracking-wider text-foreground text-center">
          3 Easy Options — Choose One
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-1 leading-snug">
          <span className="font-bold text-warning">A)</span> No interest, paid off in 3 yrs ·{" "}
          <span className="font-bold text-primary">B)</span> Lowest monthly over 10 yrs ·{" "}
          <span className="font-bold text-success">C)</span> Skip financing & take the instant rebate
        </p>
      </div>

      {/* Option A — 0% / 36 mo (MOST POPULAR) */}
      <div className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 bg-warning/5 border-l-4 border-warning relative",
        compact && "py-2"
      )}>
        <OptionBadge letter="A" tone="popular" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">0% APR · 36 Months<sup className="text-warning">*</sup></span>
            <StarTag tone="popular">Most Popular</StarTag>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
            <span className={cn("font-black text-warning", compact ? "text-lg" : "text-xl")}>
              {fmtMoney(monthly36)}<span className="text-xs font-normal text-muted-foreground">/mo</span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Option B — 9.99% / 120 mo (LOWEST MO) */}
      <div className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 bg-primary/5 border-l-4 border-primary",
        compact && "py-2"
      )}>
        <OptionBadge letter="B" tone="lowest" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">9.99% APR · 120 Months<sup className="text-primary">*</sup></span>
            <StarTag tone="lowest">Lowest Mo</StarTag>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
            <span className={cn("font-black text-primary", compact ? "text-lg" : "text-xl")}>
              {fmtMoney(monthly120)}<span className="text-xs font-normal text-muted-foreground">/mo</span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Option C — Instant Factory Rebate (LOWEST $) */}
      <div className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 bg-success/5 border-l-4 border-success",
        compact && "py-2"
      )}>
        <OptionBadge letter="C" tone="best" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">Instant Factory Rebate</span>
            <StarTag tone="best">Lowest $</StarTag>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
            <span className={cn("font-black text-success", compact ? "text-lg" : "text-xl")}>
              {fmtMoney(rebatePrice)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Banknote className="h-3 w-3" />
              <span>Cash</span>
              <span className="text-muted-foreground/50">·</span>
              <FileText className="h-3 w-3" />
              <span>Check</span>
              <span className="text-muted-foreground/50">·</span>
              <CreditCard className="h-3 w-3" />
              <span>Card</span>
            </span>
          </div>
          {savingsVsFinanced > 0 && (
            <p className="text-[11px] font-bold text-success mt-0.5">
              ↓ Save {fmtMoney(savingsVsFinanced, false)} vs. financed
            </p>
          )}
        </div>
      </div>

      {financingDisclaimer && (
        <div className={cn(
          "border-t border-border bg-muted/40 px-3 py-2",
          compact && "py-1.5"
        )}>
          <p className="text-[10px] text-muted-foreground leading-snug">
            <span className="text-warning font-bold">*</span> {financingDisclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
