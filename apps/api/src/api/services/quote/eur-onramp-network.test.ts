import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import { config } from "../../../config/vars";
import { QuoteService } from ".";

const request = {
  from: EPaymentMethod.SEPA,
  inputAmount: "100",
  inputCurrency: FiatToken.EURC,
  network: Networks.AssetHub,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.AssetHub
};

describe("EUR onramp destination rejection", () => {
  it("returns a public bad request for an AssetHub destination", async () => {
    await expect(new QuoteService().createQuote(request)).rejects.toMatchObject({
      isPublic: true,
      message: QuoteError.EurOnrampNetworkUnsupported,
      status: 400
    });
  });
});

describe("EUR onramp kill switch", () => {
  const enabled = { ...request, network: Networks.Polygon, to: Networks.Polygon };
  const unavailable = { isPublic: true, message: QuoteError.AnchorTemporarilyUnavailable, status: 503 };

  it("rejects direct and best quotes for new EUR pay-ins while disabled", async () => {
    config.monerium.eurOnrampEnabled = false;
    try {
      await expect(new QuoteService().createQuote(enabled)).rejects.toMatchObject(unavailable);
      const { network: _network, to: _to, ...best } = enabled;
      await expect(new QuoteService().createBestQuote(best)).rejects.toMatchObject(unavailable);
    } finally {
      config.monerium.eurOnrampEnabled = true;
    }
  });
});
