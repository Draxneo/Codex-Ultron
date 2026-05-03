import { describe, expect, it } from "vitest";
import { getActionOwnership } from "./actionOwnership";

describe("getActionOwnership", () => {
  it("routes quote follow-ups to a person and requires a schedule", () => {
    const result = getActionOwnership({
      category: "follow_up",
      title: "David and Erica Mora - carport quote follow up",
      suggested_action: "Prepare the bid on Monday",
      metadata: { follow_up_date: "2026-05-04" },
    });

    expect(result.ownerType).toBe("person");
    expect(result.requiresSchedule).toBe(true);
  });

  it("routes CPS, warranty, permit, and inspection questions to closeout", () => {
    const result = getActionOwnership({
      category: "thread_attention",
      title: "Customer asked about CPS rebate paperwork",
      description: "They want to know if the warranty was registered and inspection scheduled.",
      metadata: {},
    });

    expect(result.ownerType).toBe("office_queue");
    expect(result.ownerQueue).toBe("closeout");
    expect(result.ownerLabel).toBe("Closeout queue");
    expect(result.requiresSchedule).toBe(false);
  });

  it("keeps billing cleanup in the billing queue", () => {
    const result = getActionOwnership({
      category: "thread_attention",
      title: "Customer says invoice was already paid",
      description: "Check receipt and balance.",
      metadata: {},
    });

    expect(result.ownerType).toBe("office_queue");
    expect(result.ownerQueue).toBe("billing");
  });
});

