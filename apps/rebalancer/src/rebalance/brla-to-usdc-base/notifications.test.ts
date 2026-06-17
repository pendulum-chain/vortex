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

    expect(message).toContain("*Summary*");
    expect(message).toContain("Route            USDC in      BRLA mid    USDC out    Cost      Cost bps");
    expect(message).toContain("Main+BRLA Nabla  1000.000000  994.500000  991.500000  8.500000  85.00");
    expect(message).not.toContain("0.85%");
    expect(message).toContain("*Policy*");
    expect(message).toContain("auto  execute   severe  520      85        250      1000");
  });
});
