import { describe, expect, it } from "bun:test";
import Big from "big.js";
import { multiplyByPowerOfTen } from "./contracts";

describe("multiplyByPowerOfTen", () => {
  it("scales by a positive power of ten without touching the input", () => {
    const input = new Big("1.5");

    expect(multiplyByPowerOfTen(input, 3).toFixed()).toBe("1500");
    expect(input.toFixed()).toBe("1.5");
  });

  it("scales down by a negative power of ten", () => {
    expect(multiplyByPowerOfTen("2500000", -6).toFixed()).toBe("2.5");
  });

  it("returns zero unchanged", () => {
    expect(multiplyByPowerOfTen(0, 12).toFixed()).toBe("0");
  });
});
