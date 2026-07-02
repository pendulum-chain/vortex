import {
  AlfredpayApiService,
  CreateAlfredpayOfframpQuoteRequest,
  CreateAlfredpayOnrampQuoteRequest,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { ALFREDPAY_ANONYMOUS_CUSTOMER_ID } from "../alfredpay-customer";
import { priceFeedService } from "../../priceFeed.service";
import { createQuoteContext } from "../core/quote-context";
import { OnRampInitializeAlfredpayEngine } from "./initialize/onramp-alfredpay";
import { OfframpTransactionAlfredpayEngine } from "./partners/offramp-alfredpay";

function stubAlfredpayQuote() {
  return {
    expiration: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    fees: [],
    fromAmount: "100",
    quoteId: "alfredpay-quote-1",
    toAmount: "99"
  };
}

describe("Alfredpay quote auth", () => {
  const originalGetInstance = AlfredpayApiService.getInstance;
  const originalConvertCurrency = priceFeedService.convertCurrency;

  afterEach(() => {
    AlfredpayApiService.getInstance = originalGetInstance;
    priceFeedService.convertCurrency = originalConvertCurrency;
  });

  it("serves anonymous Alfredpay onramp quotes with the sentinel customer id in metadata", async () => {
    let capturedRequest: CreateAlfredpayOnrampQuoteRequest | undefined;
    AlfredpayApiService.getInstance = mock(() => ({
      createOnrampQuote: async (request: CreateAlfredpayOnrampQuoteRequest) => {
        capturedRequest = request;
        return stubAlfredpayQuote();
      }
    })) as unknown as typeof AlfredpayApiService.getInstance;

    const ctx = createQuoteContext({
      partner: null,
      request: {
        from: EPaymentMethod.ACH,
        inputAmount: "100",
        inputCurrency: FiatToken.USD,
        network: Networks.Polygon,
        outputCurrency: EvmToken.USDC,
        rampType: RampDirection.BUY,
        to: Networks.Polygon
      },
      targetFeeFiatCurrency: FiatToken.USD
    });

    await new OnRampInitializeAlfredpayEngine().execute(ctx);

    expect(capturedRequest?.metadata.customerId).toBe(ALFREDPAY_ANONYMOUS_CUSTOMER_ID);
    expect(ctx.alfredpayMint?.quoteId).toBe("alfredpay-quote-1");
  });

  it("serves anonymous Alfredpay off-ramp quotes with the sentinel customer id in metadata", async () => {
    priceFeedService.convertCurrency = mock(async () => "20") as typeof priceFeedService.convertCurrency;
    let capturedRequest: CreateAlfredpayOfframpQuoteRequest | undefined;
    AlfredpayApiService.getInstance = mock(() => ({
      createOfframpQuote: async (request: CreateAlfredpayOfframpQuoteRequest) => {
        capturedRequest = request;
        return stubAlfredpayQuote();
      }
    })) as unknown as typeof AlfredpayApiService.getInstance;

    const ctx = createQuoteContext({
      partner: null,
      request: {
        from: Networks.Polygon,
        inputAmount: "10",
        inputCurrency: EvmToken.USDC,
        network: Networks.Polygon,
        outputCurrency: FiatToken.MXN,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.SPEI
      },
      targetFeeFiatCurrency: FiatToken.MXN
    });
    ctx.evmToEvm = {
      fromNetwork: Networks.Polygon,
      fromToken: "0x0000000000000000000000000000000000000001",
      inputAmountDecimal: new Big("10"),
      inputAmountRaw: "10000000",
      networkFeeUSD: "0",
      outputAmountDecimal: new Big("10"),
      outputAmountRaw: "10000000",
      toNetwork: Networks.Polygon,
      toToken: "0x0000000000000000000000000000000000000002"
    };
    ctx.subsidy = {
      actualOutputAmountDecimal: new Big("10"),
      actualOutputAmountRaw: "10000000",
      applied: false,
      expectedOutputAmountDecimal: new Big("10"),
      expectedOutputAmountRaw: "10000000",
      idealSubsidyAmountInOutputTokenDecimal: new Big("0"),
      idealSubsidyAmountInOutputTokenRaw: "0",
      partnerId: null,
      subsidyAmountInOutputTokenDecimal: new Big("0"),
      subsidyAmountInOutputTokenRaw: "0",
      subsidyRate: new Big("0"),
      targetOutputAmountDecimal: new Big("10"),
      targetOutputAmountRaw: "10000000"
    };

    await new OfframpTransactionAlfredpayEngine().execute(ctx);

    expect(capturedRequest?.metadata.customerId).toBe(ALFREDPAY_ANONYMOUS_CUSTOMER_ID);
    expect(ctx.alfredpayOfframp?.quoteId).toBe("alfredpay-quote-1");
  });
});
