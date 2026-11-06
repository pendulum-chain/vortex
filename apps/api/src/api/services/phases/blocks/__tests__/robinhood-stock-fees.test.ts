import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import httpStatus from "http-status";
import Anchor from "../../../../../models/anchor.model";
import { APIError } from "../../../../errors/api-error";
import * as partnerPricingNamespace from "../../../partners/partner-pricing.service";
import { priceFeedService } from "../../../priceFeed.service";

const partnerPricingReal = { ...partnerPricingNamespace };
const pricing = {
  id: "stocks-partner",
  markupCurrency: EvmToken.USDC,
  markupType: "none",
  markupValue: 0,
  vortexFeeType: "relative",
  vortexFeeValue: 0.0005
};
mock.module("../../../partners/partner-pricing.service", () => ({
  ...partnerPricingReal,
  findPartnerWithPricing: async () => pricing
}));

const { calculateFeeComponents } = await import("../core/quote-fees");

const originalConvertCurrency = priceFeedService.convertCurrency;
const originalFindAll = Anchor.findAll;
const convertCurrency = mock(async (amount: string, ..._rest: unknown[]) => amount);

const stockSell = {
  from: Networks.Robinhood,
  inputAmount: "2",
  inputCurrency: EvmToken.NVDA,
  outputAmountOfframp: "0",
  outputCurrency: FiatToken.BRL,
  partnerId: "stocks-partner",
  rampType: RampDirection.SELL,
  to: EPaymentMethod.PIX
};

beforeEach(() => {
  convertCurrency.mockReset();
  convertCurrency.mockImplementation(async amount => amount);
  priceFeedService.convertCurrency = convertCurrency as unknown as typeof priceFeedService.convertCurrency;
  Anchor.findAll = mock(async () => []) as unknown as typeof Anchor.findAll;
});

afterEach(() => {
  priceFeedService.convertCurrency = originalConvertCurrency;
  Anchor.findAll = originalFindAll;
});

afterAll(() => {
  mock.module("../../../partners/partner-pricing.service", () => ({ ...partnerPricingReal }));
});

describe("calculateFeeComponents on a stock sell", () => {
  it("values the relative fee base on the source network", async () => {
    convertCurrency.mockImplementation(async (amount, from) => (from === EvmToken.NVDA ? "360" : amount));

    const result = await calculateFeeComponents(stockSell);

    expect(convertCurrency).toHaveBeenCalledWith("2", EvmToken.NVDA, EvmToken.USDC, null, Networks.Robinhood);
    expect(result.vortexFee).toBe("0.18");
  });

  it("does not name a source network for a fiat-funded buy", async () => {
    await calculateFeeComponents({
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      outputCurrency: EvmToken.NVDA,
      partnerId: "stocks-partner",
      rampType: RampDirection.BUY,
      to: Networks.Robinhood
    });

    expect(convertCurrency).toHaveBeenCalledWith("100", FiatToken.BRL, EvmToken.USDC, null, undefined);
  });

  it("keeps the public price error instead of the generic fee failure", async () => {
    convertCurrency.mockImplementation(async () => {
      throw new APIError({ isPublic: true, message: QuoteError.StockPriceUnavailable, status: httpStatus.SERVICE_UNAVAILABLE });
    });

    await expect(calculateFeeComponents(stockSell)).rejects.toMatchObject({ message: QuoteError.StockPriceUnavailable, status: 503 });
  });

  it("still masks any other failure", async () => {
    convertCurrency.mockImplementation(async () => {
      throw new Error("boom");
    });

    await expect(calculateFeeComponents(stockSell)).rejects.toMatchObject({
      message: QuoteError.FailedToCalculateFeeComponents,
      status: 500
    });
  });
});
