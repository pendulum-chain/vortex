import { afterAll, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import * as partnerPricingService from "../../../partners/partner-pricing.service";
import { priceFeedService } from "../../../priceFeed.service";

const findPartnerWithPricing = mock(async () => null);
mock.module("../../../partners/partner-pricing.service", () => ({
  ...partnerPricingService,
  findPartnerWithPricing
}));

const { simulateOfframpSubsidizePost } = await import("../phases/subsidize-post/simulation");

afterAll(() => {
  mock.module("../../../partners/partner-pricing.service", () => ({ ...partnerPricingService }));
});

describe("block offramp subsidy USD valuation", () => {
  it("values BRLA input in USD before applying the inverted BRL rate", async () => {
    const originalRate = priceFeedService.getFiatToUsdExchangeRate;
    priceFeedService.getFiatToUsdExchangeRate = mock(async () => new Big("0.2")) as never;
    const notes: string[] = [];

    try {
      const result = await simulateOfframpSubsidizePost(
        { amount: new Big("100"), amountRaw: "100000000000000000000", chain: Networks.Base, token: EvmToken.BRLA },
        {
          addNote: note => notes.push(note),
          fees: {
            displayFiat: { anchor: "0", currency: FiatToken.BRL, network: "0", partnerMarkup: "0", total: "0", vortex: "0" },
            usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" }
          },
          notes,
          now: new Date(),
          partner: null,
          request: {
            from: Networks.Base,
            inputAmount: "100",
            inputCurrency: EvmToken.BRLA,
            network: Networks.Base,
            outputCurrency: FiatToken.BRL,
            rampType: RampDirection.SELL,
            to: EPaymentMethod.PIX
          },
          targetFeeFiatCurrency: FiatToken.BRL
        }
      );

      expect(result.metadata.expectedOutputAmountDecimal.toString()).toBe("100");
      expect(notes).toContain(
        "OfframpSubsidizePost: valued input 100 BRLA at 20.000000 USD for discount calculation"
      );
    } finally {
      priceFeedService.getFiatToUsdExchangeRate = originalRate;
    }
  });

  it("uses the source block's bridged USDC amount for non-pegged input", async () => {
    const originalRate = priceFeedService.getFiatToUsdExchangeRate;
    priceFeedService.getFiatToUsdExchangeRate = mock(async () => new Big("0.2")) as never;

    try {
      const result = await simulateOfframpSubsidizePost(
        {
          amount: new Big("499"),
          amountRaw: "499000000000000000000",
          chain: Networks.Base,
          requestInputAmountUsd: new Big("100"),
          token: EvmToken.BRLA
        },
        {
          addNote: () => undefined,
          fees: {
            displayFiat: { anchor: "0", currency: FiatToken.BRL, network: "0", partnerMarkup: "0", total: "0", vortex: "0" },
            usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" }
          },
          notes: [],
          now: new Date(),
          partner: null,
          request: {
            from: Networks.Ethereum,
            inputAmount: "0.05",
            inputCurrency: EvmToken.ETH,
            network: Networks.Ethereum,
            outputCurrency: FiatToken.BRL,
            rampType: RampDirection.SELL,
            to: EPaymentMethod.PIX
          },
          targetFeeFiatCurrency: FiatToken.BRL
        }
      );

      expect(result.metadata.expectedOutputAmountDecimal.toString()).toBe("500");
    } finally {
      priceFeedService.getFiatToUsdExchangeRate = originalRate;
    }
  });
});
