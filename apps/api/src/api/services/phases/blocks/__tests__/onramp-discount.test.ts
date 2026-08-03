import { afterAll, afterEach, describe, expect, it, mock, setSystemTime } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { config } from "../../../../../config/vars";
import * as partnerPricingNamespace from "../../../partners/partner-pricing.service";
import * as priceFeedNamespace from "../../../priceFeed.service";
import * as squidrouterNamespace from "../core/squidrouter";
import type { PhaseCtx } from "../core/types";

const partnerPricingReal = { ...partnerPricingNamespace };
const priceFeedReal = { ...priceFeedNamespace };
const squidrouterReal = { ...squidrouterNamespace };

const pricingById = new Map<string, { fiatCurrency: FiatToken; targetDiscount: number }>();
const bridgeQuoteRequests: Array<{
  amountDecimal: string;
  fromNetwork: Networks;
  inputCurrency: EvmToken;
  outputCurrency: EvmToken;
  toNetwork: Networks;
}> = [];

mock.module("../../../partners/partner-pricing.service", () => ({
  findPartnerWithPricing: async ({ id }: { id?: string }, _rampType: RampDirection, fiatCurrency: FiatToken) => {
    const pricing = id ? pricingById.get(id) : undefined;
    if (!id || !pricing || pricing.fiatCurrency !== fiatCurrency) return null;
    return {
      displayName: id,
      fiatCurrency,
      id,
      logoUrl: null,
      markupCurrency: EvmToken.USDC,
      markupType: "none",
      markupValue: 0,
      maxDynamicDifference: 0.01,
      maxSubsidy: 0.5,
      minDynamicDifference: -0.01,
      name: id,
      payoutAddressEvm: null,
      payoutAddressSubstrate: null,
      rampType: RampDirection.BUY,
      targetDiscount: pricing.targetDiscount,
      vortexFeeType: "none",
      vortexFeeValue: 0
    };
  }
}));

mock.module("../../../priceFeed.service", () => ({
  priceFeedService: {
    getFiatToUsdExchangeRate: async (currency: FiatToken) => new Big(currency === FiatToken.BRL ? "0.2" : "1.08")
  }
}));

mock.module("../core/squidrouter", () => ({
  getEvmBridgeQuote: async (request: (typeof bridgeQuoteRequests)[number]) => {
    bridgeQuoteRequests.push(request);
    return { outputAmountDecimal: new Big(request.amountDecimal).times("0.9") };
  }
}));

afterEach(() => {
  pricingById.clear();
  bridgeQuoteRequests.length = 0;
  setSystemTime();
});

afterAll(() => {
  mock.module("../../../partners/partner-pricing.service", () => ({ ...partnerPricingReal }));
  mock.module("../../../priceFeed.service", () => ({ ...priceFeedReal }));
  mock.module("../core/squidrouter", () => ({ ...squidrouterReal }));
});

const { calculateExpectedOutput, resolveActivePartnerById } = await import("../core/discount");
const { simulateDistributeFees } = await import("../phases/distribute-fees/simulation");
const { simulateSubsidizePost } = await import("../phases/subsidize-post/simulation");

function buildCtx(fiatCurrency: FiatToken, partnerId: string, to: Networks, outputCurrency: EvmToken): PhaseCtx {
  return {
    addNote() {},
    fees: {
      displayFiat: {
        anchor: "0",
        currency: fiatCurrency,
        network: "1.25",
        partnerMarkup: "0.5",
        total: "2.5",
        vortex: "0.75"
      },
      usd: { anchor: "0", network: "1.25", partnerMarkup: "0.5", total: "2.5", vortex: "0.75" }
    },
    notes: [],
    now: new Date(),
    partner: { id: partnerId },
    request: {
      from: fiatCurrency === FiatToken.BRL ? EPaymentMethod.PIX : EPaymentMethod.SEPA,
      inputAmount: fiatCurrency === FiatToken.BRL ? "500" : "100",
      inputCurrency: fiatCurrency,
      network: Networks.Base,
      outputCurrency,
      rampType: RampDirection.BUY,
      to
    }
  };
}

describe("onramp discount semantics", () => {
  it("applies BRL dynamic adjustment, post-swap fee deduction, and a non-1:1 Squid rate", async () => {
    const partnerId = "brl-dynamic-partner";
    pricingById.set(partnerId, { fiatCurrency: FiatToken.BRL, targetDiscount: 0.02 });
    setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const partner = await resolveActivePartnerById(partnerId, RampDirection.BUY, FiatToken.BRL);
    calculateExpectedOutput("500", new Big("0.2"), 0.02, false, partner);
    setSystemTime(new Date("2026-01-01T00:11:00.000Z"));

    const ctx = buildCtx(FiatToken.BRL, partnerId, Networks.Arbitrum, EvmToken.USDC);
    const afterFees = await simulateDistributeFees(
      { amount: new Big("100"), amountRaw: "100000000", chain: Networks.Base, token: EvmToken.USDC },
      ctx
    );
    expect(afterFees.metadata).toMatchObject({
      networkFeeUsd: "1.25",
      partnerMarkupUsd: "0.5",
      totalFeesUsd: "2.5",
      vortexFeeUsd: "0.75"
    });
    expect(afterFees.output.amount.toFixed()).toBe("97.5");
    expect(afterFees.output.amountRaw).toBe("97500000");
    const result = await simulateSubsidizePost(afterFees.output, ctx);

    expect(result.metadata.partnerId).toBe(partnerId);
    expect(Big(result.metadata.actualOutputAmountDecimal).toFixed()).toBe("97.5");
    expect(result.metadata.actualOutputAmountRaw).toBe("97500000");
    const adjustedDifference = new Big(config.quote.deltaDBasisPoints).div(10000);
    const adjustedTargetDiscount = new Big("0.02").plus(adjustedDifference);
    const bridgeInput = new Big(100).times(adjustedTargetDiscount.plus(1));
    const expectedOutput = bridgeInput.div("0.9");
    expect(Big(result.metadata.adjustedDifference).toFixed()).toBe(adjustedDifference.toFixed());
    expect(Big(result.metadata.adjustedTargetDiscount).toFixed()).toBe(adjustedTargetDiscount.toFixed());
    expect(Big(result.metadata.expectedOutputAmountDecimal).toFixed(6)).toBe(expectedOutput.toFixed(6));
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed(6)).toBe(expectedOutput.minus("97.5").toFixed(6));
    expect(result.metadata.applied).toBe(true);
    expect(bridgeQuoteRequests).toEqual([
      {
        amountDecimal: bridgeInput.toFixed(),
        fromNetwork: Networks.Base,
        inputCurrency: EvmToken.USDC,
        outputCurrency: EvmToken.USDC,
        toNetwork: Networks.Arbitrum
      }
    ]);
  });

  it("applies the resolved EUR partner discount on the Base USDC 1:1 route", async () => {
    const partnerId = "eur-discount-partner";
    pricingById.set(partnerId, { fiatCurrency: FiatToken.EURC, targetDiscount: 0.01 });
    const ctx = buildCtx(FiatToken.EURC, partnerId, Networks.Base, EvmToken.USDC);

    const afterFees = await simulateDistributeFees(
      { amount: new Big("107"), amountRaw: "107000000", chain: Networks.Base, token: EvmToken.USDC },
      ctx
    );
    const result = await simulateSubsidizePost(afterFees.output, ctx);

    expect(result.metadata.partnerId).toBe(partnerId);
    expect(Big(result.metadata.actualOutputAmountDecimal).toFixed()).toBe("104.5");
    expect(Big(result.metadata.adjustedDifference).toFixed()).toBe("0");
    expect(Big(result.metadata.adjustedTargetDiscount).toFixed()).toBe("0.01");
    expect(Big(result.metadata.expectedOutputAmountDecimal).toFixed()).toBe("109.08");
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed()).toBe("4.58");
    expect(result.metadata.applied).toBe(true);
    expect(bridgeQuoteRequests).toEqual([]);
  });
});
