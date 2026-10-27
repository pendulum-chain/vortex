import { afterAll, afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { Address, Hex } from "viem";
import { config } from "../../../config/vars";
import { getPublicClient, isPartialFill, PartialFillError, quoteRouteOutput } from "./chain";

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

describe("quoteRouteOutput", () => {
  const QUOTER = "0x4444444444444444444444444444444444444444" as Address;
  const savedRpcUrl = config.moneriumB2b.rpcUrl;

  // getPublicClient caches one client, so a spy on it reaches the quoteRouteOutput call.
  function stubQuote(sqrtPriceX96AfterList: bigint[]): void {
    config.moneriumB2b.rpcUrl ||= "http://rpc.invalid";
    spyOn(getPublicClient(), "simulateContract").mockResolvedValue({
      result: [990n, sqrtPriceX96AfterList, [1], 0n]
    } as never);
  }

  afterEach(() => mock.restore());

  afterAll(() => {
    config.moneriumB2b.rpcUrl = savedRpcUrl;
  });

  it("rejects a quote whose route runs out of liquidity", async () => {
    stubQuote([7919900000000000000000000000000000n, 4295128740n]);
    await expect(quoteRouteOutput(QUOTER, "0xaa" as Hex, 1000n)).rejects.toBeInstanceOf(PartialFillError);
  });

  it("returns the output of a quote that takes the whole amount", async () => {
    stubQuote([7484000000000000000000000000000000n]);
    expect(await quoteRouteOutput(QUOTER, "0xaa" as Hex, 1000n)).toBe(990n);
  });
});
