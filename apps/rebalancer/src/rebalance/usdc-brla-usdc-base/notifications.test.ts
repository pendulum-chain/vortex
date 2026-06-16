import {describe, expect, test} from "bun:test";
import Big from "big.js";
import {formatBaseRebalanceCompletionMessage} from "./notifications.ts";

const policyConfig = {
  hardMaxCostBps: 1_000,
  maxCostBpsMild: 25,
  maxCostBpsModerate: 75,
  maxCostBpsSevere: 250,
  mode: "auto" as const,
  moderateDeviationBps: 200,
  severeDeviationBps: 500
};

describe("Base rebalance Slack notifications", () => {
  test("formats summary and policy bounds in Slack-friendly code tables", () => {
    const message = formatBaseRebalanceCompletionMessage({
      brlaReceived: Big("994.5"),
      cost: Big("12.34"),
      finalUsdcBalance: Big("987.66"),
      initialUsdcBalance: Big("1000"),
      policy: {
        config: policyConfig,
        decision: {
          allowedCostBps: 75,
          band: "moderate",
          costBps: 42,
          dryRun: false,
          projectedCostRaw: "4200000",
          reason: "Projected cost 42 bps is within moderate limit 75 bps.",
          shouldExecute: true
        },
        deviationBps: 220
      },
      requestedUsdc: Big("1000"),
      route: "squidrouter"
    });

    expect(message).toContain("*Rebalance summary*");
    expect(message).toContain("Route           SquidRouter");
    expect(message).toContain("Net USDC cost   12.340000 USDC");
    expect(message).toContain("Cost/requested  123.40 bps");
    expect(message).not.toContain("Cost/requested amount");
    expect(message).not.toContain("1.23%");
    expect(message).toContain("*Policy bounds*");
    expect(message).toContain("```\nMode");
    expect(message).toContain("Band               moderate");
    expect(message).toContain("Deviation          220 bps");
    expect(message).toContain("Allowed for band   75 bps");
    expect(message).toContain("Hard max cost      1000 bps");
  });
});
