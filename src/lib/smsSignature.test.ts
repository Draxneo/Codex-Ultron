import { describe, expect, it } from "vitest";
import { SMS_SIGNATURE, appendSmsSignature } from "./smsSignature";

describe("appendSmsSignature", () => {
  it("adds the Carnes and Sons footer once", () => {
    const signed = appendSmsSignature("We are on the way.");

    expect(signed).toContain(SMS_SIGNATURE);
    expect(signed.match(new RegExp(SMS_SIGNATURE, "g"))).toHaveLength(1);
  });

  it("does not duplicate the footer when called twice", () => {
    const signed = appendSmsSignature("Thanks for calling.");
    const signedAgain = appendSmsSignature(signed);

    expect(signedAgain).toBe(signed);
    expect(signedAgain.match(new RegExp(SMS_SIGNATURE, "g"))).toHaveLength(1);
  });
});
