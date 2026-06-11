import {QuoteError} from "@vortexfi/shared";
import {describe, expect, it} from "bun:test";
import httpStatus from "http-status";
import {createLowLiquidityQuoteError, isLowLiquidityQuoteError} from "./errors";

describe("quote error helpers", () => {
  it("recognizes low-liquidity provider failures", () => {
    expect(isLowLiquidityQuoteError(new Error("Low liquidity for selected route"))).toBe(true);
    expect(isLowLiquidityQuoteError(new Error("Please reduce swap amount and try again"))).toBe(true);
    expect(isLowLiquidityQuoteError(new Error("insufficientLiquidity"))).toBe(true);
    expect(isLowLiquidityQuoteError(new Error("SwapPool: EXCEEDS_MAX_COVERAGE_RATIO"))).toBe(true);
  });

  it("does not classify unrelated provider failures as low liquidity", () => {
    expect(isLowLiquidityQuoteError(new Error("Invalid Squidrouter response"))).toBe(false);
  });

  it("creates a user-facing 500 quote error", () => {
    const error = createLowLiquidityQuoteError();

    expect(error.isPublic).toBe(true);
    expect(error.message).toBe(QuoteError.LowLiquidity);
    expect(error.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    expect(error.type).toBeUndefined();
  });
});
