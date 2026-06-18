import {describe, expect, test} from "bun:test";
import Big from "big.js";
import {evaluatePaidRunDailyLimit, sumTodayBridgedUsdRaw} from "./dailyLimit.ts";

describe("Base rebalancer daily limit orchestration", () => {
  test("profitable current runs bypass daily history lookup", async () => {
    let contextCalls = 0;

    const decision = await evaluatePaidRunDailyLimit("600000000", true, async () => {
      contextCalls += 1;
      return { bridgedToday: Big("9500000000"), dailyLimitRaw: Big("10000000000") };
    });

    expect(decision).toBeUndefined();
    expect(contextCalls).toBe(0);
  });

  test("paid current runs enforce the daily limit after loading history context", async () => {
    let contextCalls = 0;

    const decision = await evaluatePaidRunDailyLimit("600000000", false, async () => {
      contextCalls += 1;
      return { bridgedToday: Big("9500000000"), dailyLimitRaw: Big("10000000000") };
    });

    expect(contextCalls).toBe(1);
    expect(decision).toMatchObject({
      projectedTotalRaw: "10100000000",
      reason: "daily_limit_reached",
      shouldSkip: true
    });
  });

  test("combined Base history counts all completed runs for later paid-run checks", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const yesterday = "2026-06-17T23:59:59.999Z";
    const today = "2026-06-18T00:00:00.000Z";

    const bridgedToday = sumTodayBridgedUsdRaw(
      [
        { cost: "-1", costRelative: "-0.001", endingTime: today, initialAmount: "200000000", startingTime: today },
        { cost: "1", costRelative: "0.001", endingTime: yesterday, initialAmount: "999000000", startingTime: yesterday }
      ],
      [{ cost: "2", costRelative: "0.002", endingTime: today, initialAmount: "300000000", startingTime: today }],
      now
    );

    expect(bridgedToday.toString()).toBe("500000000");
  });
});
