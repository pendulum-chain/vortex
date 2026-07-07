import { describe, expect, test } from "bun:test";
import { squidrouterRouteResponseSchema, squidrouterStatusResponseSchema } from "./schemas";

function validRouteBody() {
  return {
    route: {
      estimate: {
        aggregateSlippage: 1.2,
        toAmount: "9950000",
        toAmountMin: "9900000",
        toAmountUSD: "9.95",
        toToken: { decimals: 6, symbol: "USDT" }
      },
      params: { fromChain: "137" },
      quoteId: "q-123",
      transactionRequest: {
        data: "0xabc123",
        gasLimit: "350000",
        target: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
        value: "125000000000000000"
      }
    }
  };
}

describe("squidrouterRouteResponseSchema", () => {
  test("accepts a full response including fields we don't consume", () => {
    expect(() => squidrouterRouteResponseSchema.parse(validRouteBody())).not.toThrow();
  });

  test("accepts a response without aggregateSlippage (read defensively in getRoute)", () => {
    const body = validRouteBody();
    delete (body.route.estimate as Record<string, unknown>).aggregateSlippage;
    expect(() => squidrouterRouteResponseSchema.parse(body)).not.toThrow();
  });

  test("rejects a missing consumed field (quoteId)", () => {
    const body = validRouteBody();
    delete (body.route as Record<string, unknown>).quoteId;
    expect(() => squidrouterRouteResponseSchema.parse(body)).toThrow();
  });

  test("rejects a non-raw-units toAmount", () => {
    const body = validRouteBody();
    body.route.estimate.toAmount = "9.95";
    expect(() => squidrouterRouteResponseSchema.parse(body)).toThrow();
  });

  test("rejects a non-address transaction target", () => {
    const body = validRouteBody();
    body.route.transactionRequest.target = "not-an-address";
    expect(() => squidrouterRouteResponseSchema.parse(body)).toThrow();
  });
});

describe("squidrouterStatusResponseSchema", () => {
  test("accepts a status response with extra fields", () => {
    const body = {
      fromChain: { chainId: "137" },
      id: "status-1",
      isGMPTransaction: true,
      routeStatus: [],
      squidTransactionStatus: "success",
      status: "success"
    };
    expect(() => squidrouterStatusResponseSchema.parse(body)).not.toThrow();
  });

  test("rejects a missing consumed field (isGMPTransaction)", () => {
    expect(() => squidrouterStatusResponseSchema.parse({ status: "success" })).toThrow();
  });
});
