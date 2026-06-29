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
  opportunisticUsdcToBrlaMaxCostBps: 10,
  severeDeviationBps: 500
};

describe("Base rebalance Slack notifications", () => {
  test("formats summary and policy bounds in Slack-friendly code tables", () => {
    const message = formatBaseRebalanceCompletionMessage({
      brlaReceived: Big("994.5"),
      cost: Big("12.34"),
      finalUsdcBalance: Big("987.66"),
      initialUsdcBalance: Big("1000"),
      edgeCaseFlags: ["OPP", "FB"],
      policy: {
        config: policyConfig,
        dailyVolume: {
          bypassedForProfit: false,
          limitRaw: "10000000000",
          projectedTotalRaw: "3500000000",
          usedRaw: "2500000000"
        },
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

    expect(message).toContain("*Summary*");
    expect(message).toContain("Route        Req USDC     BRLA out    Start        Final       Cost       Cost bps");
    expect(message).toContain("SquidRouter  1000.000000  994.500000  1000.000000  987.660000  12.340000  123.40");
    expect(message).not.toContain("Cost/requested amount");
    expect(message).not.toContain("1.23%");
    expect(message).toContain("*Policy*");
    expect(message).toContain("Mode  Decision  Band      Dev bps  Cost bps  Cap bps  Hard bps");
    expect(message).toContain("auto  execute   moderate  220      42        75       1000");
    expect(message).toContain("Daily used/limit  Daily proj  Flags");
    expect(message).toContain("2500.00/10000.00  3500.00     OPP+FB");
    expect(message).toContain("Bands bps: mod>=200 severe>=500 | caps bps: mild<=25 mod<=75 severe<=250");
  });
});
