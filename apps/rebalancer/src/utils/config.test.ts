import {afterEach, beforeEach, describe, expect, test} from "bun:test";
import {
  getConfig,
  getRebalancingCostPolicyConfig,
  parseRebalancingDailyBridgeLimitUsd,
  parseRebalancingMaxUsdcCoverage,
  parseRebalancingPolicyMode
} from "./config.ts";

const policyEnvVars = [
  "EVM_ACCOUNT_SECRET",
  "REBALANCING_DAILY_BRIDGE_LIMIT_USD",
  "REBALANCING_USD_TO_BRL_AMOUNT",
  "REBALANCING_PROFITABLE_USD_TO_BRL_AMOUNT",
  "REBALANCING_POLICY_MODE",
  "REBALANCING_MODERATE_DEVIATION_BPS",
  "REBALANCING_SEVERE_DEVIATION_BPS",
  "REBALANCING_MAX_COST_BPS_MILD",
  "REBALANCING_MAX_COST_BPS_MODERATE",
  "REBALANCING_MAX_COST_BPS_SEVERE",
  "REBALANCING_HARD_MAX_COST_BPS",
  "REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS",
  "REBALANCING_MAX_USDC_COVERAGE"
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

describe("parseRebalancingMaxUsdcCoverage", () => {
  test("leaves the cap off when the env value is missing or blank", () => {
    expect(parseRebalancingMaxUsdcCoverage(undefined)).toBeUndefined();
    expect(parseRebalancingMaxUsdcCoverage(" ")).toBeUndefined();
  });

  test("parses a coverage ratio", () => {
    expect(parseRebalancingMaxUsdcCoverage("1.3")).toBe(1.3);
  });

  test("rejects values that would silently disable or over-block the cap", () => {
    for (const value of ["1,3", "1_3", "0", "0.5", "-1", "abc"]) {
      expect(() => parseRebalancingMaxUsdcCoverage(value)).toThrow(
        "REBALANCING_MAX_USDC_COVERAGE must be a coverage ratio of at least 1 (e.g. 1.3)."
      );
    }
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
      opportunisticUsdcToBrlaMaxCostBps: 10,
      severeDeviationBps: 500
    });
  });

  test("allows configuring the opportunistic USDC to BRLA max cost", () => {
    process.env.REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS = "7.5";

    expect(getRebalancingCostPolicyConfig().opportunisticUsdcToBrlaMaxCostBps).toBe(7.5);
  });

  test("rejects invalid opportunistic USDC to BRLA max cost", () => {
    process.env.REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS = "not-a-number";

    expect(() => getRebalancingCostPolicyConfig()).toThrow(
      "REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS must be a non-negative number."
    );
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

describe("getConfig", () => {
  test("defaults the profitable USDC to BRLA amount to the standard amount", () => {
    process.env.EVM_ACCOUNT_SECRET = "test test test test test test test test test test test junk";
    process.env.REBALANCING_USD_TO_BRL_AMOUNT = "1000";

    expect(getConfig().rebalancingProfitableUsdToBrlAmount).toBe("1000");
  });

  test("allows configuring a larger profitable USDC to BRLA amount", () => {
    process.env.EVM_ACCOUNT_SECRET = "test test test test test test test test test test test junk";
    process.env.REBALANCING_USD_TO_BRL_AMOUNT = "1000";
    process.env.REBALANCING_PROFITABLE_USD_TO_BRL_AMOUNT = "2000";

    expect(getConfig().rebalancingProfitableUsdToBrlAmount).toBe("2000");
  });

  test("leaves the USDC pool coverage cap off unless configured", () => {
    process.env.EVM_ACCOUNT_SECRET = "test test test test test test test test test test test junk";
    expect(getConfig().rebalancingMaxUsdcCoverage).toBeUndefined();

    process.env.REBALANCING_MAX_USDC_COVERAGE = "1.3";
    expect(getConfig().rebalancingMaxUsdcCoverage).toBe(1.3);
  });
});
