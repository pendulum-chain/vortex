import { describe, expect, it } from "bun:test";
import Big from "big.js";
import { calculateExpectedOutput, calculateSubsidyAmount } from "./helpers";

describe("calculateSubsidyAmount", () => {
  it("returns 0 when actual output meets expected output", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(100), 0);
    expect(result.toString()).toBe("0");
  });

  it("returns 0 when actual output exceeds expected output", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(110), 0);
    expect(result.toString()).toBe("0");
  });

  it("returns full shortfall when no maxSubsidy cap", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(90), 0);
    expect(result.toString()).toBe("10");
  });

  it("caps subsidy at maxSubsidy fraction of expected output", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(80), 0.05);
    // shortfall=20, maxAllowed=100*0.05=5
    expect(result.toString()).toBe("5");
  });

  it("returns full shortfall when it is less than maxSubsidy cap", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(95), 0.1);
    // shortfall=5, maxAllowed=100*0.1=10
    expect(result.toString()).toBe("5");
  });

});

// The negative-discount / rate-floor logic lives in calculateExpectedOutput, not
// calculateSubsidyAmount (which only sees the resulting expectedOutput).
describe("calculateExpectedOutput with negative targetDiscount (rate floor)", () => {
  it("lowers the expected output below the oracle rate for an onramp", () => {
    const { expectedOutput, adjustedTargetDiscount } = calculateExpectedOutput("100", new Big(1), -0.001, false, null);
    // rate = 1 * (1 - 0.001) = 0.999
    expect(expectedOutput.toString()).toBe("99.9");
    expect(adjustedTargetDiscount.toString()).toBe("-0.001");
  });

  it("inverts the oracle price for offramps before applying the discount", () => {
    const { expectedOutput } = calculateExpectedOutput("100", new Big(5), -0.01, true, null);
    // USD-FIAT rate = 1/5 = 0.2; discounted = 0.2 * 0.99 = 0.198
    expect(expectedOutput.toString()).toBe("19.8");
  });

  it("applies a positive targetDiscount as a rate premium", () => {
    const { expectedOutput } = calculateExpectedOutput("100", new Big(1), 0.02, false, null);
    expect(expectedOutput.toString()).toBe("102");
  });
});
