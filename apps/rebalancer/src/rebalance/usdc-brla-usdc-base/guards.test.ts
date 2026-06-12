import { describe, expect, test } from "bun:test";
import Big from "big.js";
import { calculateMinimumDelta, calculateTargetBalanceRaw, wouldExceedDailyBridgeLimit } from "./guards.ts";

describe("USDC Base rebalance guards", () => {
  test("calculates arrival target from the starting balance plus expected delta", () => {
    expect(calculateTargetBalanceRaw("500000000", "100000000", "1")).toBe("600000000");
  });

  test("supports tolerated delta checks without treating the total balance as the received amount", () => {
    expect(calculateMinimumDelta(Big("100"), "0.998").toString()).toBe("99.8");
  });

  test("daily bridge limit includes the amount about to be rebalanced", () => {
    expect(wouldExceedDailyBridgeLimit(Big("9500000000"), Big("600000000"), Big("10000000000"))).toBe(true);
    expect(wouldExceedDailyBridgeLimit(Big("9000000000"), Big("1000000000"), Big("10000000000"))).toBe(false);
  });
});
