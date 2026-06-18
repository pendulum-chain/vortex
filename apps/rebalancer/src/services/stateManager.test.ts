import {describe, expect, test} from "bun:test";
import {createUsdcBaseRebalanceState, UsdcBaseRebalancePhase} from "./stateManager.ts";

describe("USDC Base rebalance state", () => {
  test("stores opportunistic fallback policy in the initial state payload", () => {
    const state = createUsdcBaseRebalanceState("100000000", UsdcBaseRebalancePhase.CheckInitialUsdcBalance, {
      opportunisticDeviationBps: 0,
      opportunisticMaxCostBps: 10,
      opportunisticRequiresProfit: true,
      opportunisticUsdcToBrla: true
    });

    expect(state.usdcAmountRaw).toBe("100000000");
    expect(state.opportunisticUsdcToBrla).toBe(true);
    expect(state.opportunisticMaxCostBps).toBe(10);
    expect(state.opportunisticRequiresProfit).toBe(true);
    expect(state.opportunisticDeviationBps).toBe(0);
  });
});
