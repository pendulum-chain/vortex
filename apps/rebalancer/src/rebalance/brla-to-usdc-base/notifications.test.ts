import {describe, expect, test} from "bun:test";
import Big from "big.js";
import {formatBrlaToUsdcBaseCompletionMessage} from "./notifications.ts";

const policyConfig = {
  hardMaxCostBps: 1_000,
  maxCostBpsMild: 25,
  maxCostBpsModerate: 75,
  maxCostBpsSevere: 250,
  mode: "auto" as const,
  moderateDeviationBps: 200,
  severeDeviationBps: 500
};

describe("BRLA to USDC Base Slack notifications", () => {
  test("formats summary and policy bounds in Slack-friendly code tables", () => {
    const message = formatBrlaToUsdcBaseCompletionMessage({
      brlaIntermediate: Big("994.5"),
      cost: Big("8.5"),
      policy: {
        config: policyConfig,
        decision: {
          allowedCostBps: 250,
          band: "severe",
          costBps: 85,
          dryRun: false,
          projectedCostRaw: "8500000",
          reason: "Projected cost 85 bps is within severe limit 250 bps.",
          shouldExecute: true
        },
        deviationBps: 520
      },
      usdcIn: Big("1000"),
      usdcOut: Big("991.5")
    });

    expect(message).toContain("*Rebalance summary*");
    expect(message).toContain("Route              Main Nabla + BRLA Nabla");
    expect(message).toContain("Net USDC cost      8.500000 USDC");
    expect(message).toContain("Cost/input         85.00 bps");
    expect(message).not.toContain("0.85%");
    expect(message).toContain("*Policy bounds*");
    expect(message).toContain("Band               severe");
    expect(message).toContain("Deviation          520 bps");
    expect(message).toContain("Allowed for band   250 bps");
  });
});
