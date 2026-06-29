import {describe, expect, test} from "bun:test";
import Big from "big.js";
import {
  calculateMinimumDelta,
  calculateProjectedCostBps,
  calculateTargetBalanceRaw,
  evaluateDailyBridgeLimit,
  evaluateFallbackRoutePolicy,
  evaluateRebalancingCostPolicy,
  getRebalancingUrgencyBand,
  isProjectedProfit,
  type RebalancingCostPolicyConfig,
  shouldTriggerOpportunisticUsdcToBrla,
  wouldExceedDailyBridgeLimit
} from "./guards.ts";

const policyConfig: RebalancingCostPolicyConfig = {
  hardMaxCostBps: 1_000,
  maxCostBpsMild: 25,
  maxCostBpsModerate: 75,
  maxCostBpsSevere: 250,
  mode: "auto",
  moderateDeviationBps: 200,
  opportunisticUsdcToBrlaMaxCostBps: 10,
  severeDeviationBps: 500
};

describe("USDC Base rebalance guards", () => {
  test("calculates arrival target from the starting balance plus expected delta", () => {
    expect(calculateTargetBalanceRaw("500000000", "100000000", "1")).toBe("600000000");
  });

  test("supports tolerated delta checks without treating the total balance as the received amount", () => {
    expect(calculateMinimumDelta(Big("100"), "0.998").toString()).toBe("99.8");
  });

  test("allows small Base USDC arrival shortfalls with the default tolerance", () => {
    expect(calculateTargetBalanceRaw("13148408", "999225918", "0.998")).toBe("1010375874");
  });

  test("daily bridge limit includes the amount about to be rebalanced", () => {
    expect(wouldExceedDailyBridgeLimit(Big("9500000000"), Big("600000000"), Big("10000000000"))).toBe(true);
    expect(wouldExceedDailyBridgeLimit(Big("9000000000"), Big("1000000000"), Big("10000000000"))).toBe(false);
  });

  test("detects profitable projected rebalances", () => {
    expect(isProjectedProfit(Big("100000000"), Big("101000000"))).toBe(true);
    expect(isProjectedProfit(Big("100000000"), Big("100000000"))).toBe(false);
    expect(isProjectedProfit(Big("100000000"), Big("99000000"))).toBe(false);
  });

  test("evaluates daily bridge limit decisions for paid rebalances", () => {
    expect(evaluateDailyBridgeLimit(Big("9000000000"), Big("600000000"), Big("10000000000"))).toMatchObject({
      reason: "under_limit",
      shouldSkip: false
    });
    expect(evaluateDailyBridgeLimit(Big("9500000000"), Big("600000000"), Big("10000000000"))).toMatchObject({
      reason: "daily_limit_reached",
      shouldSkip: true
    });
  });

  test("calculates projected rebalancing cost in basis points", () => {
    expect(calculateProjectedCostBps(Big("100000000"), Big("99000000"))).toBe(100);
    expect(calculateProjectedCostBps(Big("100000000"), Big("101000000"))).toBe(-100);
  });

  test("triggers opportunistic USDC to BRLA rebalances only below the route cost cap", () => {
    const maxCostBps = 7.5;

    expect(shouldTriggerOpportunisticUsdcToBrla(-1, maxCostBps)).toBe(true);
    expect(shouldTriggerOpportunisticUsdcToBrla(maxCostBps - 0.01, maxCostBps)).toBe(true);
    expect(shouldTriggerOpportunisticUsdcToBrla(maxCostBps, maxCostBps)).toBe(false);
  });

  test("allows fallback routes only when they satisfy opportunistic policy checks", () => {
    expect(
      evaluateFallbackRoutePolicy(Big("100000000"), Big("99910000"), 0, policyConfig, {
        opportunisticMaxCostBps: policyConfig.opportunisticUsdcToBrlaMaxCostBps,
        requireOpportunisticCost: true,
        requireProfit: false
      }).shouldExecute
    ).toBe(true);

    expect(
      evaluateFallbackRoutePolicy(Big("100000000"), Big("99900000"), 0, policyConfig, {
        opportunisticMaxCostBps: policyConfig.opportunisticUsdcToBrlaMaxCostBps,
        requireOpportunisticCost: true,
        requireProfit: false
      }).shouldExecute
    ).toBe(false);
  });

  test("requires fallback route profit when the original route was projected profitable", () => {
    expect(
      evaluateFallbackRoutePolicy(Big("100000000"), Big("100100000"), 0, policyConfig, {
        opportunisticMaxCostBps: policyConfig.opportunisticUsdcToBrlaMaxCostBps,
        requireOpportunisticCost: true,
        requireProfit: true
      }).shouldExecute
    ).toBe(true);

    const decision = evaluateFallbackRoutePolicy(Big("100000000"), Big("99910000"), 0, policyConfig, {
      opportunisticMaxCostBps: policyConfig.opportunisticUsdcToBrlaMaxCostBps,
      requireOpportunisticCost: true,
      requireProfit: true
    });

    expect(decision.shouldExecute).toBe(false);
    expect(decision.reason).toContain("not profitable");
  });

  test("selects urgency bands from coverage deviation", () => {
    expect(getRebalancingUrgencyBand(50, policyConfig)).toBe("mild");
    expect(getRebalancingUrgencyBand(200, policyConfig)).toBe("moderate");
    expect(getRebalancingUrgencyBand(500, policyConfig)).toBe("severe");
  });

  test("skips mild rebalances when projected cost exceeds the mild limit", () => {
    const decision = evaluateRebalancingCostPolicy(Big("100000000"), Big("99000000"), 50, policyConfig);

    expect(decision.shouldExecute).toBe(false);
    expect(decision.band).toBe("mild");
    expect(decision.costBps).toBe(100);
  });

  test("allows severe rebalances at a higher configured cost", () => {
    const decision = evaluateRebalancingCostPolicy(Big("100000000"), Big("99000000"), 600, policyConfig);

    expect(decision.shouldExecute).toBe(true);
    expect(decision.band).toBe("severe");
    expect(decision.allowedCostBps).toBe(250);
  });

  test("dry-run evaluates but never executes", () => {
    const decision = evaluateRebalancingCostPolicy(Big("100000000"), Big("99900000"), 50, {
      ...policyConfig,
      mode: "dry-run"
    });

    expect(decision.shouldExecute).toBe(false);
    expect(decision.dryRun).toBe(true);
    expect(decision.reason).toContain("Dry-run");
  });

  test("off mode never executes", () => {
    const decision = evaluateRebalancingCostPolicy(Big("100000000"), Big("100000000"), 600, {
      ...policyConfig,
      mode: "off"
    });

    expect(decision.shouldExecute).toBe(false);
    expect(decision.reason).toBe("Rebalancing policy mode is off.");
  });

  test("hard max cost cap blocks even always mode", () => {
    const decision = evaluateRebalancingCostPolicy(Big("100000000"), Big("80000000"), 600, {
      ...policyConfig,
      mode: "always"
    });

    expect(decision.shouldExecute).toBe(false);
    expect(decision.reason).toContain("hard cap");
  });
});
