import { describe, expect, it } from "vitest";
import {
  detectCentralOffset,
  formatCurrency,
  formatDateFriendly,
  formatPhone,
  formatPhoneInput,
  isValidSmsPhone,
  normalizeLast10,
  toE164,
} from "@/lib/formatters";

describe("phone formatters", () => {
  it("formats standard US phone numbers for display", () => {
    expect(formatPhone("2108787887")).toBe("(210) 878-7887");
    expect(formatPhone("+1 (210) 878-7887")).toBe("(210) 878-7887");
  });

  it("normalizes valid SMS numbers to E.164", () => {
    expect(toE164("(210) 878-7887")).toBe("+12108787887");
    expect(toE164("+12108787887")).toBe("+12108787887");
    expect(isValidSmsPhone("210-878-7887")).toBe(true);
    expect(isValidSmsPhone("878-7887")).toBe(false);
  });

  it("keeps controlled input formatting lenient", () => {
    expect(formatPhoneInput("210")).toBe("(210");
    expect(formatPhoneInput("210878")).toBe("(210) 878");
    expect(normalizeLast10("+1 (210) 878-7887")).toBe("2108787887");
  });
});

describe("money and date formatters", () => {
  it("formats currency with configurable decimal places", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(1234.5, 0)).toBe("$1,235");
  });

  it("formats date-only values without timezone drift", () => {
    expect(formatDateFriendly("2026-03-29")).toBe("Sunday, March 29th");
  });

  it("detects Central Time daylight and standard offsets", () => {
    expect(detectCentralOffset("2026-01-15")).toBe("-06:00");
    expect(detectCentralOffset("2026-07-15")).toBe("-05:00");
  });
});
