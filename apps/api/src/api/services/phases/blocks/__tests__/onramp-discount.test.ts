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

const pricingById = new Map<string, { fiatCurrency: FiatToken; maxSubsidy?: number; targetDiscount: number }>();
const bridgeQuoteRequests: Array<{
  amountDecimal: string;
  fromNetwork: Networks;
  inputCurrency: EvmToken;
  outputCurrency: EvmToken;
  toNetwork: Networks;
}> = [];
let bridgeQuoteFactory = (request: (typeof bridgeQuoteRequests)[number]) => ({
  outputAmountDecimal: new Big(request.amountDecimal).times("0.9"),
  outputAmountUsd: new Big(request.amountDecimal).times("0.9")
});

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
      maxSubsidy: pricing.maxSubsidy ?? 0.5,
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
    return bridgeQuoteFactory(request);
  }
}));

afterEach(() => {
  pricingById.clear();
  bridgeQuoteRequests.length = 0;
  bridgeQuoteFactory = request => ({
    outputAmountDecimal: new Big(request.amountDecimal).times("0.9"),
    outputAmountUsd: new Big(request.amountDecimal).times("0.9")
  });
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
    // The applied subsidy is floored to token decimals so the output decimal/raw pair stays consistent.
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed(6)).toBe(expectedOutput.minus("97.5").toFixed(6, 0));
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

  it("keeps routed-onramp subsidy independent of destination-token quantity", async () => {
    const partnerId = "token-unit-invariance-partner";
    pricingById.set(partnerId, { fiatCurrency: FiatToken.BRL, maxSubsidy: 0.003, targetDiscount: 0.02 });
    const oracleExpectedUsd = new Big("102");
    const expectedSourceUsdc = oracleExpectedUsd.div("0.9");
    const expectedSubsidy = oracleExpectedUsd.times("0.003");
    const cases = [
      { outputAmountDecimal: "91.8", outputCurrency: EvmToken.USDC, to: Networks.Arbitrum },
      { outputAmountDecimal: "0.0204", outputCurrency: "PAXG" as EvmToken, to: Networks.Ethereum },
      { outputAmountDecimal: "0.02295", outputCurrency: EvmToken.ETH, to: Networks.Ethereum },
      { outputAmountDecimal: "183.6", outputCurrency: EvmToken.POL, to: Networks.Polygon }
    ];

    for (const testCase of cases) {
      bridgeQuoteFactory = () => ({
        outputAmountDecimal: new Big(testCase.outputAmountDecimal),
        outputAmountUsd: oracleExpectedUsd.times("0.9")
      });
      const ctx = buildCtx(FiatToken.BRL, partnerId, testCase.to, testCase.outputCurrency);
      const result = await simulateSubsidizePost(
        { amount: new Big("90"), amountRaw: "90000000", chain: Networks.Base, token: EvmToken.USDC },
        ctx
      );

      expect(Big(result.metadata.expectedOutputAmountDecimal).toFixed(6)).toBe(expectedSourceUsdc.toFixed(6));
      expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed(6)).toBe(expectedSubsidy.toFixed(6));
      expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).lte(expectedSubsidy)).toBe(true);
      expect(result.metadata.outputCurrency).toBe(EvmToken.USDC);
    }
  });

  it("falls back to the oracle target when Squid returns a non-positive USD value", async () => {
    const partnerId = "invalid-route-value-partner";
    pricingById.set(partnerId, { fiatCurrency: FiatToken.BRL, maxSubsidy: 0.5, targetDiscount: 0.02 });
    bridgeQuoteFactory = request => ({
      outputAmountDecimal: new Big(request.amountDecimal).times("1000000"),
      outputAmountUsd: new Big(0)
    });

    const result = await simulateSubsidizePost(
      { amount: new Big("97.5"), amountRaw: "97500000", chain: Networks.Base, token: EvmToken.USDC },
      buildCtx(FiatToken.BRL, partnerId, Networks.Ethereum, "PAXG" as EvmToken)
    );

    expect(Big(result.metadata.expectedOutputAmountDecimal).toFixed()).toBe("102");
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed()).toBe("4.5");
  });

  it("falls back to the oracle target when Squid's USD value cannot be parsed", async () => {
    const partnerId = "invalid-route-number-partner";
    pricingById.set(partnerId, { fiatCurrency: FiatToken.BRL, maxSubsidy: 0.5, targetDiscount: 0.02 });
    bridgeQuoteFactory = () => {
      throw new Error("Invalid Squid output USD value");
    };

    const result = await simulateSubsidizePost(
      { amount: new Big("97.5"), amountRaw: "97500000", chain: Networks.Base, token: EvmToken.USDC },
      buildCtx(FiatToken.BRL, partnerId, Networks.Ethereum, "PAXG" as EvmToken)
    );

    expect(Big(result.metadata.expectedOutputAmountDecimal).toFixed()).toBe("102");
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed()).toBe("4.5");
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

  it("anchors a routed EUR subsidy cap to oracle USD instead of destination-token units", async () => {
    const partnerId = "eur-routed-partner";
    pricingById.set(partnerId, { fiatCurrency: FiatToken.EURC, maxSubsidy: 0.003, targetDiscount: -0.0008 });
    bridgeQuoteFactory = request => ({
      outputAmountDecimal: new Big("0.024"),
      outputAmountUsd: new Big(request.amountDecimal).times("0.98")
    });
    const ctx = buildCtx(FiatToken.EURC, partnerId, Networks.Ethereum, EvmToken.ETH);
    const oracleExpectedUsd = new Big("100").times("1.08").times(new Big(1).minus("0.0008"));
    const result = await simulateSubsidizePost(
      { amount: new Big("104.5"), amountRaw: "104500000", chain: Networks.Base, token: EvmToken.USDC },
      ctx
    );

    expect(Big(result.metadata.expectedOutputAmountDecimal).toFixed(6)).toBe(oracleExpectedUsd.div("0.98").toFixed(6));
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed(6)).toBe(
      oracleExpectedUsd.times("0.003").round(6, Big.roundDown).toFixed(6)
    );
    expect(result.metadata.outputCurrency).toBe(EvmToken.USDC);
  });

  it("regression: a negative target discount still subsidizes up to its worse-than-reference rate floor", async () => {
    const partnerId = "eur-negative-discount-partner";
    pricingById.set(partnerId, { fiatCurrency: FiatToken.EURC, targetDiscount: -0.01 });
    const ctx = buildCtx(FiatToken.EURC, partnerId, Networks.Base, EvmToken.USDC);

    const afterFees = await simulateDistributeFees(
      { amount: new Big("105"), amountRaw: "105000000", chain: Networks.Base, token: EvmToken.USDC },
      ctx
    );
    const result = await simulateSubsidizePost(afterFees.output, ctx);

    expect(result.metadata.partnerId).toBe(partnerId);
    expect(Big(result.metadata.actualOutputAmountDecimal).toFixed()).toBe("102.5");
    expect(Big(result.metadata.adjustedTargetDiscount).toFixed()).toBe("-0.01");
    // 100 EUR * 1.08 * (1 - 0.01) = 106.92 — below the 108 reference, but still above actual.
    expect(Big(result.metadata.expectedOutputAmountDecimal).toFixed()).toBe("106.92");
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed()).toBe("4.42");
    expect(result.metadata.applied).toBe(true);
  });

  it("does not subsidize past a negative rate floor the actual output already beats", async () => {
    const partnerId = "eur-floor-beaten-partner";
    pricingById.set(partnerId, { fiatCurrency: FiatToken.EURC, targetDiscount: -0.01 });
    const ctx = buildCtx(FiatToken.EURC, partnerId, Networks.Base, EvmToken.USDC);

    const afterFees = await simulateDistributeFees(
      { amount: new Big("110"), amountRaw: "110000000", chain: Networks.Base, token: EvmToken.USDC },
      ctx
    );
    const result = await simulateSubsidizePost(afterFees.output, ctx);

    // Actual 107.5 already exceeds the 106.92 floor: no subsidy.
    expect(Big(result.metadata.subsidyAmountInOutputTokenDecimal).toFixed()).toBe("0");
    expect(result.metadata.applied).toBe(false);
  });
});
