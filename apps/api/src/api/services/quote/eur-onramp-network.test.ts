import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import { QuoteService } from ".";

const request = {
  from: EPaymentMethod.SEPA,
  inputAmount: "100",
  inputCurrency: FiatToken.EURC,
  network: Networks.Polygon,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Polygon
};

describe("EUR onramp destination rejection", () => {
  it("returns a public bad request for a Polygon destination", async () => {
    await expect(new QuoteService().createQuote(request)).rejects.toMatchObject({
      isPublic: true,
      message: QuoteError.EurOnrampNetworkUnsupported,
      status: 400
    });
  });

  it("returns the same bad request for an AssetHub destination", async () => {
    await expect(
      new QuoteService().createQuote({ ...request, network: Networks.AssetHub, to: Networks.AssetHub })
    ).rejects.toMatchObject({ isPublic: true, message: QuoteError.EurOnrampNetworkUnsupported, status: 400 });
  });
});
