import {describe, expect, test} from "bun:test";
import {sumTodayBridgedUsdRaw} from "./dailyLimit.ts";

describe("Base rebalancer daily limit history", () => {
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
