import { afterAll, describe, expect, it, mock } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import * as priceFeedNamespace from "../../../priceFeed.service";
import * as discountNamespace from "../core/discount";

const discountReal = { ...discountNamespace };
const priceFeedReal = { ...priceFeedNamespace };

const partner = { id: "partner-1", maxSubsidy: 1, targetDiscount: 0.01 };

mock.module("../core/discount", () => ({
  ...discountReal,
  calculateExpectedOutput: () => ({
    adjustedDifference: new Big(0),
    adjustedTargetDiscount: new Big(0),
    expectedOutput: new Big("5000")
  }),
  calculateSubsidyAmount: () => new Big("2.3456785"),
  getUsdDenominatedInputAmount: async (ctx: { request: { inputAmount: string } }) => new Big(ctx.request.inputAmount),
  resolveDiscountPartner: async () => partner
}));
mock.module("../../../priceFeed.service", () => ({
  priceFeedService: { getFiatToUsdExchangeRate: async () => new Big("0.2") }
}));

const { simulateSubsidizePost, simulateOfframpSubsidizePost } = await import("../phases/subsidize-post/simulation");
const { computeExpectedOutput } = await import("../phases/subsidize-pre/simulation");

afterAll(() => {
  mock.module("../core/discount", () => ({ ...discountReal }));
  mock.module("../../../priceFeed.service", () => ({ ...priceFeedReal }));
});

function makeCtx(rampType: RampDirection) {
  return {
    addNote() {},
    notes: [],
    now: new Date(),
    partner: null,
    request: {
      from: Networks.Base,
      inputAmount: "5000",
      inputCurrency: FiatToken.BRL,
      network: Networks.Base,
      outputCurrency: EvmToken.USDC,
      rampType,
      to: Networks.Base
    }
  } as never;
}

describe("subsidy rounding invariants", () => {
  it("keeps the BUY subsidize-post output decimal/raw pair floor-consistent", async () => {
    const result = await simulateSubsidizePost(
      {
        amount: new Big("4977.5784895"),
        amountRaw: "4977578489",
        chain: Networks.Base,
        token: EvmToken.USDC
      },
      makeCtx(RampDirection.BUY)
    );

    // subsidy 2.3456785 floors to 2.345678 -> raw 2345678; without flooring, the flow-final
    // decimal rounds one raw unit above the funded raw (the incident class one phase later).
    expect(result.output.amountRaw).toBe("4979924167");
    expect(new Big(result.output.amount).times(1e6).toFixed(0, 0)).toBe(result.output.amountRaw);
  });

  it("carries the canonical raw through offramp subsidize-post instead of reconstructing it", async () => {
    const result = await simulateOfframpSubsidizePost(
      {
        amount: new Big("100.0000015"),
        amountRaw: "100000000",
        chain: Networks.Base,
        token: EvmToken.USDC
      },
      makeCtx(RampDirection.SELL)
    );

    expect(result.metadata.actualOutputAmountRaw).toBe("100000000");
    expect(result.output.amountRaw).toBe(new Big("100000000").plus("2345678").toFixed(0));
  });

  it("scales the expected-output raw by the token decimals, not a hardcoded 10^6", async () => {
    const expected = await computeExpectedOutput(makeCtx(RampDirection.BUY), 18);

    // 5000 BRL * 0.2 = 1000 tokens at 18 decimals
    expect(expected.raw).toBe(new Big("1000").times(new Big(10).pow(18)).toFixed(0));
  });
});
