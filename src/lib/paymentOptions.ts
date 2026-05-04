/**
 * paymentOptions.ts — Universal pricing utility for the three system-purchase
 * payment options. Single source of truth for both the human-readable labels
 * AND the monthly-payment factors. If finance terms ever change, edit this
 * file only.
 *
 * The three options are mutually exclusive — a customer picks ONE:
 *   1. financing_36mo   → 0% APR · 36 Months          (factor 0.0278)
 *   2. financing_120mo  → 9.99% APR · 120 Months      (factor 0.0125, Plan 943)
 *   3. factory_rebate   → Instant Factory Rebate      (one-time, no monthly)
 *
 * "Pay in Full" wording is forbidden anywhere in the app — option 3 is always
 * branded as "Instant Factory Rebate" regardless of how the customer settles
 * (cash, check, credit card).
 */

export type PaymentPreference = "financing_36mo" | "financing_120mo" | "factory_rebate";

/** Monthly payment factors. Multiply Financed Price by these to get monthly. */
export const PAYMENT_FACTORS = {
  /** 0% APR · 36 mo */
  financing_36mo: 0.0278,
  /** 9.99% APR · 120 mo (Plan 943) */
  financing_120mo: 0.0125,
} as const;

/** Round to 2 decimals (currency cents). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 0% APR · 36 mo monthly payment. */
export function calcMonthly36(financedPrice: number | null | undefined): number | null {
  if (financedPrice == null || !isFinite(financedPrice)) return null;
  return round2(financedPrice * PAYMENT_FACTORS.financing_36mo);
}

/** 9.99% APR · 120 mo (Plan 943) monthly payment. */
export function calcMonthly120(financedPrice: number | null | undefined): number | null {
  if (financedPrice == null || !isFinite(financedPrice)) return null;
  return round2(financedPrice * PAYMENT_FACTORS.financing_120mo);
}

/** Human-readable label for a payment_preference value (handles legacy aliases). */
export function paymentPreferenceLabel(pref: string | null | undefined): string {
  switch (pref) {
    case "financing_36mo":
      return "0% APR · 36 Months";
    case "financing_120mo":
      return "9.99% APR · 120 Months";
    case "factory_rebate":
    case "pay_in_full": // legacy alias — do not reintroduce in new code
    case "cash":         // legacy alias — do not reintroduce in new code
      return "Instant Factory Rebate";
    default:
      return pref || "—";
  }
}
