import {afterEach, describe, expect, it, mock} from "bun:test";
import {EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection} from "@vortexfi/shared";
import Big from "big.js";
import QuoteTicket from "../../../../../models/quoteTicket.model";
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

  afterEach(() => {
    QuoteTicket.create = originalQuoteTicketCreate;
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
});
