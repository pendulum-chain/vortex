import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getRebalancingCostPolicyConfig, parseRebalancingDailyBridgeLimitUsd, parseRebalancingPolicyMode } from "./config.ts";

const policyEnvVars = [
  "REBALANCING_POLICY_MODE",
  "REBALANCING_MODERATE_DEVIATION_BPS",
  "REBALANCING_SEVERE_DEVIATION_BPS",
  "REBALANCING_MAX_COST_BPS_MILD",
  "REBALANCING_MAX_COST_BPS_MODERATE",
  "REBALANCING_MAX_COST_BPS_SEVERE",
  "REBALANCING_HARD_MAX_COST_BPS"
];

const originalPolicyEnv = new Map(policyEnvVars.map(name => [name, process.env[name]]));

function restorePolicyEnv() {
  for (const name of policyEnvVars) {
    const originalValue = originalPolicyEnv.get(name);
    if (originalValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalValue;
    }
  }
}

beforeEach(() => {
  for (const name of policyEnvVars) {
    delete process.env[name];
  }
});

afterEach(restorePolicyEnv);

describe("parseRebalancingDailyBridgeLimitUsd", () => {
  test("uses the default when the env value is missing", () => {
    expect(parseRebalancingDailyBridgeLimitUsd(undefined)).toBe(10_000);
  });

  test("preserves zero as an explicit limit", () => {
    expect(parseRebalancingDailyBridgeLimitUsd("0")).toBe(0);
  });

  test("accepts common thousands separators", () => {
    expect(parseRebalancingDailyBridgeLimitUsd("100_000")).toBe(100_000);
    expect(parseRebalancingDailyBridgeLimitUsd("100,000")).toBe(100_000);
  });

  test("rejects invalid numeric values", () => {
    expect(() => parseRebalancingDailyBridgeLimitUsd("not-a-number")).toThrow(
      "REBALANCING_DAILY_BRIDGE_LIMIT_USD must be a non-negative number."
    );
  });
});

describe("parseRebalancingPolicyMode", () => {
  test("defaults to auto", () => {
    expect(parseRebalancingPolicyMode(undefined)).toBe("auto");
  });

  test("accepts supported modes", () => {
    expect(parseRebalancingPolicyMode("always")).toBe("always");
    expect(parseRebalancingPolicyMode("dry-run")).toBe("dry-run");
    expect(parseRebalancingPolicyMode("off")).toBe("off");
  });

  test("rejects unsupported modes", () => {
    expect(() => parseRebalancingPolicyMode("sometimes")).toThrow("REBALANCING_POLICY_MODE must be one of");
  });
});

describe("getRebalancingCostPolicyConfig", () => {
  test("uses conservative defaults", () => {
    const config = getRebalancingCostPolicyConfig();

    expect(config).toEqual({
      hardMaxCostBps: 1_000,
      maxCostBpsMild: 25,
      maxCostBpsModerate: 75,
      maxCostBpsSevere: 250,
      mode: "auto",
      moderateDeviationBps: 200,
      severeDeviationBps: 500
    });
  });

  test("rejects non-monotonic deviation thresholds", () => {
    process.env.REBALANCING_MODERATE_DEVIATION_BPS = "600";
    process.env.REBALANCING_SEVERE_DEVIATION_BPS = "500";

    expect(() => getRebalancingCostPolicyConfig()).toThrow(
      "REBALANCING_MODERATE_DEVIATION_BPS must be less than or equal to REBALANCING_SEVERE_DEVIATION_BPS."
    );

    delete process.env.REBALANCING_MODERATE_DEVIATION_BPS;
    delete process.env.REBALANCING_SEVERE_DEVIATION_BPS;
  });

  test("rejects non-monotonic cost thresholds", () => {
    process.env.REBALANCING_MAX_COST_BPS_MILD = "100";
    process.env.REBALANCING_MAX_COST_BPS_MODERATE = "75";

    expect(() => getRebalancingCostPolicyConfig()).toThrow(
      "Rebalancing max cost bps values must be ordered: mild <= moderate <= severe."
    );

    delete process.env.REBALANCING_MAX_COST_BPS_MILD;
    delete process.env.REBALANCING_MAX_COST_BPS_MODERATE;
  });
});
