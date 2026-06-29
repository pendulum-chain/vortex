import {
  AlfredpayApiService,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { priceFeedService } from "../../priceFeed.service";
import { createQuoteContext } from "../core/quote-context";
import { OnRampInitializeAlfredpayEngine } from "./initialize/onramp-alfredpay";
import { OfframpTransactionAlfredpayEngine } from "./partners/offramp-alfredpay";

describe("Alfredpay quote auth", () => {
  const originalGetInstance = AlfredpayApiService.getInstance;
  const originalConvertCurrency = priceFeedService.convertCurrency;

  afterEach(() => {
    AlfredpayApiService.getInstance = originalGetInstance;
    priceFeedService.convertCurrency = originalConvertCurrency;
  });

  it("rejects anonymous Alfredpay onramp quotes before calling Alfredpay", async () => {
    AlfredpayApiService.getInstance = mock(() => {
      throw new Error("Alfredpay upstream should not be called");
    }) as typeof AlfredpayApiService.getInstance;

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

    await expect(new OnRampInitializeAlfredpayEngine().execute(ctx)).rejects.toThrow(
      "Alfredpay quote creation requires an API key linked to a user or Supabase user authentication."
    );
  });

  it("rejects anonymous Alfredpay off-ramp quotes before calling Alfredpay", async () => {
    priceFeedService.convertCurrency = mock(async () => "20") as typeof priceFeedService.convertCurrency;
    AlfredpayApiService.getInstance = mock(() => {
      throw new Error("Alfredpay upstream should not be called");
    }) as typeof AlfredpayApiService.getInstance;

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

    await expect(new OfframpTransactionAlfredpayEngine().execute(ctx)).rejects.toThrow(
      "Alfredpay quote creation requires an API key linked to a user or Supabase user authentication."
    );
  });
});
