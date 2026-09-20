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

const validRouteBody = {
  route: {
    estimate: {
      aggregateSlippage: 1,
      toAmount: "1000000",
      toAmountMin: "990000",
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
};

function fetchSequence(responses: Response[]): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    const response = responses[state.calls] ?? responses[responses.length - 1];
    state.calls += 1;
    return response;
  }) as unknown as typeof fetch;
  return state;
}

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

describe("getRoute upstream error handling", () => {
  test("retries once when the gateway in front of Squid answers a non-JSON 5xx", async () => {
    const state = fetchSequence([
      new Response("<html>502 Bad Gateway</html>", { status: 502 }),
      Response.json(validRouteBody)
    ]);

    const result = await getRoute(params);

    expect(result.data.route.quoteId).toBe("quote-1");
    expect(state.calls).toBe(2);
  });

  test("does not retry Squid's own JSON errors and surfaces their message", async () => {
    const state = fetchSequence([
      Response.json({ message: "Low liquidity, please reduce swap amount and try again", statusCode: 500 }, { status: 500 })
    ]);

    await expect(getRoute(params)).rejects.toThrow("Failed to fetch route: Low liquidity");
    expect(state.calls).toBe(1);
  });
});
