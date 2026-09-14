import { afterEach, describe, expect, test } from "bun:test";
import { getRoute, type RouteParams } from "./route";

const realFetch = globalThis.fetch;

const params: RouteParams = {
  bypassGuardrails: true,
  enableExpress: true,
  fromAddress: "0x1000000000000000000000000000000000000001",
  fromAmount: "1000000",
  fromChain: "137",
  fromToken: "0x2000000000000000000000000000000000000002",
  toAddress: "0x3000000000000000000000000000000000000003",
  toChain: "137",
  toToken: "0x4000000000000000000000000000000000000004"
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("getRoute response validation", () => {
  test("rejects malformed executable route terms before returning them", async () => {
    globalThis.fetch = (async () =>
      Response.json({
        route: {
          estimate: {
            aggregateSlippage: 1,
            toAmount: "1000000",
            toAmountMin: "not-raw-units",
            toAmountUSD: "1",
            toToken: { decimals: 6 }
          },
          quoteId: "quote-1",
          transactionRequest: {
            data: "0x",
            gasLimit: "350000",
            target: "0x5000000000000000000000000000000000000005",
            value: "1000000"
          }
        }
      })) as unknown as typeof fetch;

    await expect(getRoute(params)).rejects.toThrow();
  });
});
