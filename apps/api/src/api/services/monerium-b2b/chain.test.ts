import { describe, expect, it } from "bun:test";
import { isPartialFill } from "./chain";

describe("isPartialFill", () => {
  it("flags a quote whose hop stopped at the swap limit in either direction", () => {
    // Sepolia sandbox pool at 0.3% liquidity, 5 EURe: the sell ran out of range (2026-10-20).
    expect(isPartialFill([1461446703485210103287273052203988822378723970341n])).toBe(true);
    expect(isPartialFill([7919900000000000000000000000000000n, 4295128740n])).toBe(true);
  });

  it("passes a quote that filled within the pools' liquidity", () => {
    expect(isPartialFill([7484000000000000000000000000000000n])).toBe(false);
    expect(isPartialFill([7484000000000000000000000000000000n, 79228162514264337593543950336n])).toBe(false);
  });
});
