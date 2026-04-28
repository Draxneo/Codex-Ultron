export type ComfortClubPlanSource = "install_included" | "purchased";

export type ComfortClubPublicInfo = {
  hasAgreement?: boolean;
  discountPercent?: number | string | null;
  planName?: string | null;
  planSource?: ComfortClubPlanSource | null;
  planAnnualPrice?: number | string | null;
  perks?: unknown[] | null;
  endDate?: string | null;
};

export type ComfortClubCartInput = {
  cartSubtotal?: number | null;
  actualDiscountAmount?: number | null;
  items?: Array<{
    total_price?: number | string | null;
    unit_price?: number | string | null;
    quantity?: number | string | null;
  }>;
};

export type ComfortClubCartSummary = {
  isActive: boolean;
  isLoading: boolean;
  planName: string;
  planSource: ComfortClubPlanSource | null;
  planAnnualPrice: number;
  discountPercent: number;
  perks: string[];
  endDate: string | null;
  eligibleSubtotal: number;
  estimatedSavings: number;
  appliedSavings: number;
  displayedSavings: number;
  savingsLabel: string;
};

const DEFAULT_PLAN_NAME = "Comfort Club";
const DEFAULT_ANNUAL_PRICE = 199;
const DEFAULT_DISCOUNT_PERCENT = 15;
const DEFAULT_PERKS = [
  "Priority scheduling",
  "Member repair discount",
  "Maintenance visit reminders",
];

function moneyAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function getPerkText(perk: unknown): string | null {
  if (typeof perk === "string") return perk;
  if (!perk || typeof perk !== "object") return null;

  const record = perk as Record<string, unknown>;
  const value = record.title ?? record.label ?? record.name ?? record.item ?? record.text;
  return typeof value === "string" ? value : null;
}

function normalizePerks(perks: unknown[] | null | undefined): string[] {
  const normalized = (perks || [])
    .map(getPerkText)
    .filter((perk): perk is string => !!perk?.trim());

  return normalized.length ? normalized : DEFAULT_PERKS;
}

function getEligibleSubtotal(input: ComfortClubCartInput): number {
  if (moneyAmount(input.cartSubtotal) > 0) return moneyAmount(input.cartSubtotal);

  return (input.items || []).reduce((sum, item) => {
    const explicitTotal = moneyAmount(item.total_price);
    if (explicitTotal > 0) return sum + explicitTotal;

    return sum + moneyAmount(item.unit_price) * (moneyAmount(item.quantity) || 1);
  }, 0);
}

export function buildComfortClubCartSummary(
  membership: ComfortClubPublicInfo | null | undefined,
  input: ComfortClubCartInput = {},
): ComfortClubCartSummary {
  const eligibleSubtotal = getEligibleSubtotal(input);
  const discountPercent = moneyAmount(membership?.discountPercent) || DEFAULT_DISCOUNT_PERCENT;
  const isActive = !!membership?.hasAgreement;
  const appliedSavings = isActive
    ? roundCurrency(Math.max(0, moneyAmount(input.actualDiscountAmount)))
    : 0;
  const estimatedSavings = roundCurrency(Math.max(0, eligibleSubtotal * (discountPercent / 100)));
  const displayedSavings = appliedSavings > 0 ? appliedSavings : estimatedSavings;

  return {
    isActive,
    isLoading: false,
    planName: membership?.planName || DEFAULT_PLAN_NAME,
    planSource: membership?.planSource || null,
    planAnnualPrice: moneyAmount(membership?.planAnnualPrice) || DEFAULT_ANNUAL_PRICE,
    discountPercent,
    perks: normalizePerks(membership?.perks),
    endDate: membership?.endDate || null,
    eligibleSubtotal,
    estimatedSavings,
    appliedSavings,
    displayedSavings,
    savingsLabel: appliedSavings > 0 ? "Member savings applied" : "Estimated member savings",
  };
}
