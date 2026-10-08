// Outside the suite's src/ root: run with `bun test ./scripts/monerium-b2b-sandbox-e2e.test.ts`.
import { describe, expect, it } from "bun:test";
import { eurePrice } from "./monerium-b2b-sandbox-e2e";

describe("eurePrice", () => {
  it("reads back the price the runbook seeds the Sepolia pool at (USDC is token0)", () => {
    // runbook §8.4: sqrtPriceX96 = isqrt(1e20 * 2^192 / answer) for a Chainlink answer of 1.1212
    expect(eurePrice(74823503441825338953153950560652521n, false, 8)).toBe(112120000n);
  });

  it("prices the mispriced Sepolia 5 bps pool at 0.71 USDC, as observed on 2026-10-07", () => {
    expect(eurePrice(94020040026321335569443259439335278n, false, 8)).toBe(71009802n);
  });

  it("handles EURe as token0, the mainnet ordering", () => {
    // isqrt(2^192 * 1.12e8 / 1e20): 1.12 USDC per EURe, floored by one unit
    expect(eurePrice(83847205938141328475927n, true, 8)).toBe(111999999n);
  });
});
