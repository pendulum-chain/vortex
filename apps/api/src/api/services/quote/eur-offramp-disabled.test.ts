import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { QuoteService } from ".";

const request = {
  from: Networks.Base,
  inputAmount: "100",
  inputCurrency: EvmToken.USDC,
  outputCurrency: FiatToken.EURC,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.SEPA
};

describe("EUR offramp quote rejection", () => {
  it("returns a public bad request for direct quotes", async () => {
    await expect(new QuoteService().createQuote({ ...request, network: Networks.Base })).rejects.toMatchObject({
      isPublic: true,
      message: "EUR offramps are not supported",
      status: 400
    });
  });

  it("returns the same bad request before best-quote aggregation", async () => {
    await expect(new QuoteService().createBestQuote(request)).rejects.toMatchObject({
      isPublic: true,
      message: "EUR offramps are not supported",
      status: 400
    });
  });
});
