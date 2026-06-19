import {afterEach, describe, expect, it, mock} from "bun:test";
import {EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection} from "@vortexfi/shared";
import Big from "big.js";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import {priceFeedService} from "../../../priceFeed.service";
import {QuoteContext} from "../../core/types";
import {BaseFinalizeEngine, FinalizeComputation} from ".";

class TestFinalizeEngine extends BaseFinalizeEngine {
  readonly config = {
    direction: RampDirection.BUY,
    missingFeesMessage: "Missing test fees",
    skipNote: "Skip sell quotes"
  };

  protected async computeOutput(_ctx: QuoteContext): Promise<FinalizeComputation> {
    return {
      amount: new Big(99),
      decimals: 2
    };
  }
}

describe("BaseFinalizeEngine", () => {
  const originalQuoteTicketCreate = QuoteTicket.create;
  const originalConvertCurrency = priceFeedService.convertCurrency;

  afterEach(() => {
    QuoteTicket.create = originalQuoteTicketCreate;
    priceFeedService.convertCurrency = originalConvertCurrency;
  });

  it("persists profile-priced quotes as user-owned with a separate pricing partner", async () => {
    const createdAt = new Date("2026-06-03T12:00:00.000Z");
    const expiresAt = new Date("2026-06-03T12:10:00.000Z");
    const quoteCreateMock = mock(async data => ({
      ...data,
      createdAt,
      expiresAt,
      id: "quote-1"
    }));
    QuoteTicket.create = quoteCreateMock as unknown as typeof QuoteTicket.create;

    const ctx = {
      addNote: mock(() => undefined),
      fees: {
        displayFiat: {
          anchor: "1",
          currency: FiatToken.BRL,
          network: "0",
          partnerMarkup: "2",
          total: "13",
          vortex: "10"
        },
        usd: {
          anchor: "0.2",
          network: "0",
          partnerMarkup: "0.4",
          total: "2.6",
          vortex: "2"
        }
      },
      partnerOwnerId: null,
      pricingPartnerId: "pricing-partner-id",
      request: {
        from: EPaymentMethod.PIX,
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: EvmToken.USDC,
        rampType: RampDirection.BUY,
        to: Networks.Base,
        userId: "user-1"
      }
    } as unknown as QuoteContext;

    await new TestFinalizeEngine().execute(ctx);

    expect(quoteCreateMock).toHaveBeenCalledTimes(1);
    expect(quoteCreateMock.mock.calls[0][0]).toMatchObject({
      partnerId: null,
      pricingPartnerId: "pricing-partner-id",
      status: "pending",
      userId: "user-1"
    });
  });

  it("serializes applied subsidy as a separate public discount benefit", async () => {
    const createdAt = new Date("2026-06-03T12:00:00.000Z");
    const expiresAt = new Date("2026-06-03T12:10:00.000Z");
    const quoteCreateMock = mock(async data => ({
      ...data,
      createdAt,
      expiresAt,
      id: "quote-1"
    }));
    QuoteTicket.create = quoteCreateMock as unknown as typeof QuoteTicket.create;
    priceFeedService.convertCurrency = mock(async (amount, _from, to) => {
      if (to === FiatToken.BRL) {
        return new Big(amount).mul(5).toString();
      }
      return amount;
    }) as typeof priceFeedService.convertCurrency;

    const ctx = {
      addNote: mock(() => undefined),
      fees: {
        displayFiat: {
          anchor: "1",
          currency: FiatToken.BRL,
          network: "0",
          partnerMarkup: "2",
          total: "13",
          vortex: "10"
        },
        usd: {
          anchor: "0.2",
          network: "0",
          partnerMarkup: "0.4",
          total: "2.6",
          vortex: "2"
        }
      },
      nablaSwapEvm: {
        inputAmountForSwapDecimal: "100",
        inputAmountForSwapRaw: "100000000",
        inputCurrency: EvmToken.BRLA,
        inputDecimals: 6,
        inputToken: "0xbrla",
        outputAmountDecimal: new Big("98"),
        outputAmountRaw: "98000000",
        outputCurrency: EvmToken.USDC,
        outputDecimals: 6,
        outputToken: "0xusdc"
      },
      request: {
        from: EPaymentMethod.PIX,
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: EvmToken.USDC,
        rampType: RampDirection.BUY,
        to: Networks.Base
      },
      subsidy: {
        actualOutputAmountDecimal: new Big("98"),
        actualOutputAmountRaw: "98000000",
        applied: true,
        expectedOutputAmountDecimal: new Big("100"),
        expectedOutputAmountRaw: "100000000",
        idealSubsidyAmountInOutputTokenDecimal: new Big("2"),
        idealSubsidyAmountInOutputTokenRaw: "2000000",
        partnerId: "partner-1",
        subsidyAmountInOutputTokenDecimal: new Big("2"),
        subsidyAmountInOutputTokenRaw: "2000000",
        subsidyRate: new Big("0.02"),
        targetOutputAmountDecimal: new Big("100"),
        targetOutputAmountRaw: "100000000"
      },
      targetFeeFiatCurrency: FiatToken.BRL
    } as unknown as QuoteContext;

    await new TestFinalizeEngine().execute(ctx);

    expect(quoteCreateMock.mock.calls[0][0].metadata.subsidyDisplay).toEqual({
      currency: FiatToken.BRL,
      fiat: "10.00",
      usd: "2.000000"
    });
    expect(ctx.builtResponse).toMatchObject({
      discountCurrency: FiatToken.BRL,
      discountFiat: "10.00",
      discountUsd: "2.000000"
    });
  });
});
