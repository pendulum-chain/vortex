import {describe, expect, test} from "bun:test";
import {selectEvaluatedUsdcToBrlaAmount, selectUsdcToBrlaAmount} from "./amountPolicy.ts";

describe("USDC to BRLA amount policy", () => {
  test("uses the standard amount when the projection is not profitable", () => {
    expect(selectUsdcToBrlaAmount("1000", "2000", false, null)).toEqual({
      amountUsdc: "1000",
      reason: "standard"
    });
  });

  test("uses the profitable amount when the profitable amount projection is profitable", () => {
    expect(selectUsdcToBrlaAmount("1000", "2000", true, null)).toEqual({
      amountUsdc: "2000",
      reason: "profitable"
    });
  });

  test("keeps manual amounts explicit", () => {
    expect(selectUsdcToBrlaAmount("1000", "2000", true, "750")).toEqual({
      amountUsdc: "750",
      reason: "manual"
    });
  });

  test("selects the larger evaluated amount even when the standard amount is not profitable", () => {
    expect(
      selectEvaluatedUsdcToBrlaAmount(
        { amountUsdc: "1000", projectedProfitable: false },
        { amountUsdc: "2000", projectedProfitable: true },
        null
      )
    ).toEqual({ amountUsdc: "2000", reason: "profitable" });
  });

  test("falls back to the standard evaluated amount when the larger amount is not profitable", () => {
    expect(
      selectEvaluatedUsdcToBrlaAmount(
        { amountUsdc: "1000", projectedProfitable: true },
        { amountUsdc: "2000", projectedProfitable: false },
        null
      )
    ).toEqual({ amountUsdc: "1000", reason: "standard" });
  });

  test("keeps manual amounts explicit after evaluating both configured amounts", () => {
    expect(
      selectEvaluatedUsdcToBrlaAmount(
        { amountUsdc: "1000", projectedProfitable: false },
        { amountUsdc: "2000", projectedProfitable: true },
        "750"
      )
    ).toEqual({ amountUsdc: "750", reason: "manual" });
  });
});
