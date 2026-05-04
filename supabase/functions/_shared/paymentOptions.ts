/**
 * paymentOptions.ts (Deno mirror of src/lib/paymentOptions.ts)
 *
 * Universal pricing utility for the three system-purchase payment options.
 * Edge functions can't import from src/, so this is a hand-kept mirror.
 * If you change one file, change the other.
 *
 * Options (mutually exclusive):
 *   1. financing_36mo   → 0% APR · 36 Months          (factor 0.0278)
 *   2. financing_120mo  → 9.99% APR · 120 Months      (factor 0.0125, Plan 943)
 *   3. factory_rebate   → Instant Factory Rebate      (one-time, no monthly)
 */

export type PaymentPreference = "financing_36mo" | "financing_120mo" | "factory_rebate";

export const PAYMENT_FACTORS = {
  financing_36mo: 0.0278,   // 0% APR · 36 mo
  financing_120mo: 0.0125,  // 9.99% APR · 120 mo (Plan 943)
} as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcMonthly36(financedPrice: number | null | undefined): number | null {
  if (financedPrice == null || !isFinite(financedPrice)) return null;
  return round2(financedPrice * PAYMENT_FACTORS.financing_36mo);
}

export function calcMonthly120(financedPrice: number | null | undefined): number | null {
  if (financedPrice == null || !isFinite(financedPrice)) return null;
  return round2(financedPrice * PAYMENT_FACTORS.financing_120mo);
}

export function paymentPreferenceLabel(pref: string | null | undefined): string {
  switch (pref) {
    case "financing_36mo":
      return "0% APR · 36 Months";
    case "financing_120mo":
      return "9.99% APR · 120 Months";
    case "factory_rebate":
    case "pay_in_full":
    case "cash":
      return "Instant Factory Rebate";
    default:
      return pref || "—";
  }
}
