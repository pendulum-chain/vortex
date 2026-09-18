import { afterEach, describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, QuoteError, RampDirection } from "@vortexfi/shared";
import { config } from "../../../config/vars";
import { QuoteService } from ".";

const buy = {
  from: EPaymentMethod.SPEI,
  inputAmount: "100",
  inputCurrency: FiatToken.MXN,
  network: Networks.Polygon,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Polygon
};

const sell = {
  from: Networks.Polygon,
  inputAmount: "100",
  inputCurrency: EvmToken.USDC,
  network: Networks.Polygon,
  outputCurrency: FiatToken.MXN,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.SPEI
};

const unavailable = { isPublic: true, message: QuoteError.AnchorTemporarilyUnavailable, status: 503 };

describe("fiat currency kill switch", () => {
  afterEach(() => {
    config.quote.disabledFiatCurrencies = [];
  });

  it("rejects direct and best quotes on a disabled rail in both directions", async () => {
    config.quote.disabledFiatCurrencies = [FiatToken.MXN];
    await expect(new QuoteService().createQuote(buy)).rejects.toMatchObject(unavailable);
    await expect(new QuoteService().createQuote(sell)).rejects.toMatchObject(unavailable);
    const { network: _network, to: _to, ...bestBuy } = buy;
    await expect(new QuoteService().createBestQuote(bestBuy)).rejects.toMatchObject(unavailable);
  });

  it("keeps the permanent EUR SELL rejection ahead of the temporary switch", async () => {
    // A pair that is never supported must not turn into "try again later" because its rail is
    // also switched off; the switch only speaks for otherwise-supported requests.
    config.quote.disabledFiatCurrencies = [FiatToken.EURC];
    const eurSell = { ...sell, outputCurrency: FiatToken.EURC, to: EPaymentMethod.SEPA };
    await expect(new QuoteService().createQuote(eurSell)).rejects.toMatchObject({
      isPublic: true,
      message: "EUR offramps are not supported",
      status: 400
    });
  });
});
