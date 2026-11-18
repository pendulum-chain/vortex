import {QuoteError} from "@vortexfi/shared";
import {describe, expect, it} from "bun:test";
import httpStatus from "http-status";
import {createPublicClient, custom, parseAbi} from "viem";
import {base} from "viem/chains";
import {createLowLiquidityQuoteError, isLowLiquidityQuoteError} from "./errors";

describe("quote error helpers", () => {
  it("recognizes low-liquidity provider failures", () => {
    expect(isLowLiquidityQuoteError(new Error("Low liquidity for selected route"))).toBe(true);
    expect(isLowLiquidityQuoteError(new Error("Please reduce swap amount and try again"))).toBe(true);
    expect(isLowLiquidityQuoteError(new Error("insufficientLiquidity"))).toBe(true);
    expect(isLowLiquidityQuoteError(new Error("SwapPool: EXCEEDS_MAX_COVERAGE_RATIO"))).toBe(true);
  });

  it("recognizes a Nabla pool that cannot pay the output, as viem reports it directly and through the RPC retry wrapper", async () => {
    // The Base BRLA pool's quoter reverts with Panic(0x11) when a swap would pay out more than its reserve.
    const panic = `0x4e487b71${"11".padStart(64, "0")}`;
    const client = createPublicClient({
      chain: base,
      transport: custom({
        request: async () => {
          throw Object.assign(new Error("execution reverted: panic: arithmetic underflow or overflow (0x11)"), {code: 3, data: panic});
        }
      })
    });
    const error = await client
      .readContract({
        abi: parseAbi(["function quoteSwapExactTokensForTokens(uint256,address[],address[]) view returns(uint256)"]),
        address: "0x2A7989993335b31A3133CDA93bc1a095e7b178Ff",
        args: [10_000_000n, [], []],
        functionName: "quoteSwapExactTokensForTokens"
      })
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isLowLiquidityQuoteError(error)).toBe(true);
    expect(isLowLiquidityQuoteError(new Error(`read contract failed on base: ${(error as Error).message}`))).toBe(true);
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
