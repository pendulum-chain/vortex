// eslint-disable-next-line import/no-unresolved
import {describe, expect, it} from "bun:test";
import {calculatePostSwapSubsidyComponents} from "./post-swap-subsidy-breakdown";

describe("calculatePostSwapSubsidyComponents", () => {
  it("splits live shortfall below the quoted actual output into discrepancy plus discount", () => {
    const result = calculatePostSwapSubsidyComponents({
      currentBalanceRaw: "90",
      discountSubsidyAmountRaw: "5",
      expectedOutputAmountRaw: "105",
      quotedActualOutputAmountRaw: "100"
    });

    expect(result.requiredAmountRaw.toFixed(0, 0)).toBe("15");
    expect(result.discrepancyAmountRaw.toFixed(0, 0)).toBe("10");
    expect(result.discountAmountRaw.toFixed(0, 0)).toBe("5");
  });

  it("treats shortfall above the quoted actual output as discount only", () => {
    const result = calculatePostSwapSubsidyComponents({
      currentBalanceRaw: "102",
      discountSubsidyAmountRaw: "5",
      expectedOutputAmountRaw: "105",
      quotedActualOutputAmountRaw: "100"
    });

    expect(result.requiredAmountRaw.toFixed(0, 0)).toBe("3");
    expect(result.discrepancyAmountRaw.toFixed(0, 0)).toBe("0");
    expect(result.discountAmountRaw.toFixed(0, 0)).toBe("3");
  });

  it("falls back to expected output minus discount when quoted actual output is unavailable", () => {
    const result = calculatePostSwapSubsidyComponents({
      currentBalanceRaw: "90",
      discountSubsidyAmountRaw: "5",
      expectedOutputAmountRaw: "105"
    });

    expect(result.requiredAmountRaw.toFixed(0, 0)).toBe("15");
    expect(result.discrepancyAmountRaw.toFixed(0, 0)).toBe("10");
    expect(result.discountAmountRaw.toFixed(0, 0)).toBe("5");
  });

  it("returns zero components when the live balance already reaches the target", () => {
    const result = calculatePostSwapSubsidyComponents({
      currentBalanceRaw: "106",
      discountSubsidyAmountRaw: "5",
      expectedOutputAmountRaw: "105",
      quotedActualOutputAmountRaw: "100"
    });

    expect(result.requiredAmountRaw.toFixed(0, 0)).toBe("0");
    expect(result.discrepancyAmountRaw.toFixed(0, 0)).toBe("0");
    expect(result.discountAmountRaw.toFixed(0, 0)).toBe("0");
  });
});
