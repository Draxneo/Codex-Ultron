import { describe, expect, it } from "vitest";
import {
  classifyCustomerContactIntent,
  type JarvisActiveWorkContext,
} from "../../supabase/functions/_shared/jarvisContactIntent";

const activeServiceJob: JarvisActiveWorkContext = {
  activeJob: {
    id: "job-8470",
    hcp_job_number: "8470",
    scheduled_date: "2026-05-04",
  },
  activeEstimate: null,
  pendingBooking: null,
};

const activeEstimate: JarvisActiveWorkContext = {
  activeJob: null,
  activeEstimate: {
    id: "estimate-1",
    estimate_number: "Q-1001",
    scheduled_date: "2026-05-04",
  },
  pendingBooking: null,
};

describe("jarvisContactIntent", () => {
  it("keeps a quote thread as a quote follow-up when the latest text is only contact info", () => {
    const thread = [
      "Customer: Can you quote a carport with a flat roof option?",
      "Office: Yes sir, I can work this up Monday morning.",
      "Customer: David and Erica Mora, 16214 River Cliff, erodri516@gmail.com, 210-555-1212",
    ].join("\n");

    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: thread,
      extracted: {
        intent: "info_reply",
        phone: "210-555-1212",
        email: "erodri516@gmail.com",
        address: "16214 River Cliff",
        quote_subject: "carport with flat roof option",
        follow_up_due: "Monday morning",
      },
      activeWork: null,
    });

    expect(result.intent).toBe("quote_follow_up");
    expect(result.actionCategory).toBe("follow_up");
    expect(result.shouldCreateNewWork).toBe(false);
  });

  it("treats quote approval as moving the proposal forward instead of a generic confirmation", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "The customer approved option B and said let's do it with financing.",
      extracted: { call_intent: "estimate_followup" },
      activeWork: activeEstimate,
    });

    expect(result.intent).toBe("quote_follow_up");
    expect(result.suggestedAction).toContain("move the quote");
  });

  it("attaches gate codes and pet warnings to an existing job", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Gate code is 2468 and the dogs will be in the backyard.",
      extracted: {},
      activeWork: activeServiceJob,
    });

    expect(result.intent).toBe("access_instructions");
    expect(result.shouldAttachToExistingWork).toBe(true);
    expect(result.shouldCreateNewWork).toBe(false);
  });

  it("recognizes a reschedule request for existing work", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Can we move tomorrow's appointment to Friday morning instead?",
      activeWork: activeServiceJob,
    });

    expect(result.intent).toBe("reschedule_existing_work");
    expect(result.actionCategory).toBe("schedule_change");
  });

  it("recognizes an answering service service-call text as a new booking", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Answering Service: Caller Jane Wilson, phone 210-555-8080, 123 Main St. AC is not cooling and wants someone today.",
      activeWork: null,
    });

    expect(result.intent).toBe("new_service_booking");
    expect(result.shouldCreateNewWork).toBe(true);
  });

  it("does not create a new booking when a customer asks for ETA on active work", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Do you know when Jonathan will be here?",
      activeWork: activeServiceJob,
    });

    expect(result.intent).toBe("eta_request");
    expect(result.shouldCreateNewWork).toBe(false);
  });

  it("recognizes warranty and CPS rebate questions after install", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "Did you register my warranty yet and what is going on with the CPS rebate?",
      activeWork: null,
    });

    expect(result.intent).toBe("warranty_or_membership_question");
    expect(result.actionCategory).toBe("thread_attention");
  });

  it("treats plain contact details as enrichment when there is no quote context", () => {
    const result = classifyCustomerContactIntent({
      channel: "sms",
      text: "My name is Jenny Maguire. My email is jenny@example.com and my phone number is 210-555-2222.",
      extracted: { intent: "info_reply", phone: "210-555-2222", email: "jenny@example.com" },
      activeWork: null,
    });

    expect(result.intent).toBe("customer_info_update");
  });
});
