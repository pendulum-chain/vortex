import { describe, expect, it } from "bun:test";
import Big from "big.js";
import { calculateSubsidyAmount } from "./helpers";

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

  describe("negative targetDiscount scenarios (rate floor)", () => {
    it("subsidizes when actual is below negative-target expected output", () => {
      const result = calculateSubsidyAmount(new Big(99.9), new Big(99.5), 0);
      expect(result.toString()).toBe("0.4");
    });

    it("returns 0 when actual already meets negative-target expected output", () => {
      const result = calculateSubsidyAmount(new Big(99.9), new Big(99.9), 0);
      expect(result.toString()).toBe("0");
    });

    it("returns 0 when actual exceeds negative-target expected output", () => {
      const result = calculateSubsidyAmount(new Big(99.9), new Big(100.5), 0);
      expect(result.toString()).toBe("0");
    });

    it("caps subsidy at maxSubsidy for negative target", () => {
      const result = calculateSubsidyAmount(new Big(99.9), new Big(98.0), 0.01);
      // shortfall=1.9, maxAllowed=99.9*0.01=0.999
      expect(result.toString()).toBe("0.999");
    });
  });
});
