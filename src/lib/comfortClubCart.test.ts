import { describe, expect, it } from "vitest";
import { buildComfortClubCartSummary } from "@/lib/comfortClubCart";

describe("buildComfortClubCartSummary", () => {
  it("shows applied member savings when an active member has a calculated discount", () => {
    const summary = buildComfortClubCartSummary(
      { hasAgreement: true, discountPercent: 15, planName: "Comfort Club" },
      { cartSubtotal: 500, actualDiscountAmount: 60 },
    );

    expect(summary.isActive).toBe(true);
    expect(summary.appliedSavings).toBe(60);
    expect(summary.displayedSavings).toBe(60);
    expect(summary.savingsLabel).toBe("Member savings applied");
  });

  it("estimates savings from eligible subtotal when no applied discount is present", () => {
    const summary = buildComfortClubCartSummary(
      { hasAgreement: true, discountPercent: 15 },
      { cartSubtotal: 500 },
    );

    expect(summary.estimatedSavings).toBe(75);
    expect(summary.displayedSavings).toBe(75);
  });

  it("does not treat other cart discounts as applied member savings for non-members", () => {
    const summary = buildComfortClubCartSummary(
      { hasAgreement: false, discountPercent: 15 },
      { cartSubtotal: 500, actualDiscountAmount: 60 },
    );

    expect(summary.isActive).toBe(false);
    expect(summary.appliedSavings).toBe(0);
    expect(summary.displayedSavings).toBe(75);
  });
});
