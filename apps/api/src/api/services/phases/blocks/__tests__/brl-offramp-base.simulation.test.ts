import { afterEach, describe, expect, it, mock } from "bun:test";
import { BrlaApiService, EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { simulateAveniaOfframpFee } from "../phases/avenia-offramp-fee/simulation";

const originalGetInstance = BrlaApiService.getInstance;
const originalConvertCurrency = priceFeedService.convertCurrency;

afterEach(() => {
  BrlaApiService.getInstance = originalGetInstance;
  priceFeedService.convertCurrency = originalConvertCurrency;
});

describe("BRL offramp fee simulation", () => {
  it("replaces only the anchor fee and preserves accumulated fees", async () => {
    BrlaApiService.getInstance = mock(
      () =>
        ({
          createPayOutQuote: async () => ({ inputAmount: "5.30", outputAmount: "4.55" })
        }) as unknown as BrlaApiService
    );
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as never;

    const result = await simulateAveniaOfframpFee(
      { amount: new Big("5.303854"), amountRaw: "5303854000000000000", chain: Networks.Base, token: EvmToken.BRLA },
      {
        addNote: () => {},
        fees: {
          displayFiat: {
            anchor: "0.70",
            currency: FiatToken.BRL,
            network: "0.013431",
            partnerMarkup: "0.002",
            total: "0.73",
            vortex: "0.009753"
          },
          usd: {
            anchor: "0.14",
            network: "0.013431",
            partnerMarkup: "0.002",
            total: "0.165184",
            vortex: "0.009753"
          }
        },
        notes: [],
        now: new Date(),
        partner: null,
        request: {
          from: Networks.Arbitrum,
          inputAmount: "1",
          inputCurrency: EvmToken.USDC,
          network: Networks.Arbitrum,
          outputCurrency: FiatToken.BRL,
          rampType: RampDirection.SELL,
          to: EPaymentMethod.PIX
        }
      }
    );

    expect(result.metadata).toEqual({ anchorFeeBrl: "0.75", grossAmountBrl: "5.30" });
    expect(result.fees).toEqual({
      displayFiat: {
        anchor: "0.75",
        currency: FiatToken.BRL,
        network: "0.013431",
        partnerMarkup: "0.002",
        total: "0.78",
        vortex: "0.009753"
      },
      usd: {
        anchor: "0.75",
        network: "0.013431",
        partnerMarkup: "0.002",
        total: "0.775184",
        vortex: "0.009753"
      }
    });
  });
});
