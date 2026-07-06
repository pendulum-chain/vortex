import { describe, expect, it } from "bun:test";
import Big from "big.js";
import { computeSubsidyRaw } from "./final-settlement-subsidy.helpers";

describe("computeSubsidyRaw", () => {
  it("clamps to the on-chain shortfall when a same-chain synchronous swap already delivered the output", () => {
    // delivered reads 0 because the post-swap snapshot captured the synchronously-swapped USDC,
    // but the ephemeral already holds ~expected. Without the clamp this would subsidize the full output.
    const expected = new Big("11463276");
    const delivered = new Big("0");
    const actualBalance = new Big("11463243");
    expect(computeSubsidyRaw(expected, delivered, actualBalance).toString()).toBe("33");
  });

  it("subsidizes the genuine shortfall for an under-delivering cross-chain bridge", () => {
    const expected = new Big("1000000");
    const delivered = new Big("950000");
    const actualBalance = new Big("950000");
    expect(computeSubsidyRaw(expected, delivered, actualBalance).toString()).toBe("50000");
  });

  it("returns <= 0 (no subsidy) when the ephemeral already meets the expected amount", () => {
    const expected = new Big("1000000");
    const delivered = new Big("1000000");
    const actualBalance = new Big("1000000");
    expect(computeSubsidyRaw(expected, delivered, actualBalance).lte(0)).toBe(true);
  });

  it("never exceeds the on-chain shortfall even when delivered is understated", () => {
    const expected = new Big("1000000");
    const delivered = new Big("0");
    const actualBalance = new Big("800000");
    expect(computeSubsidyRaw(expected, delivered, actualBalance).toString()).toBe("200000");
  });
});
