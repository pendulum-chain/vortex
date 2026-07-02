import {describe, expect, test} from "bun:test";
import {selectUsdcToBrlaAmount} from "./amountPolicy.ts";

describe("USDC to BRLA amount policy", () => {
  test("uses the standard amount when the projection is not profitable", () => {
    expect(selectUsdcToBrlaAmount("1000", "2000", false, null)).toEqual({
      amountUsdc: "1000",
      reason: "standard"
    });
  });

  test("uses the profitable amount when the standard projection is profitable", () => {
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
});
