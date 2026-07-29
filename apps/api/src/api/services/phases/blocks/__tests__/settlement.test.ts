import { describe, expect, it } from "bun:test";
import Big from "big.js";
import { calculateSettlementSubsidyRaw } from "../core/settlement";

describe("settlement subsidy", () => {
  it("excludes the pre-bridge balance from delivered funds", () => {
    const subsidy = calculateSettlementSubsidyRaw(new Big(100), new Big(50), new Big(40), new Big(0));
    expect(subsidy.toFixed(0)).toBe("50");
  });

  it("never tops up beyond the observable on-chain shortfall", () => {
    const subsidy = calculateSettlementSubsidyRaw(new Big(100), new Big(95), new Big(40), new Big(0));
    expect(subsidy.toFixed(0)).toBe("5");
  });

  it("includes a native gas reserve without double-counting the baseline", () => {
    const subsidy = calculateSettlementSubsidyRaw(new Big(100), new Big(100), new Big(10), new Big(5));
    expect(subsidy.toFixed(0)).toBe("5");
  });
});
