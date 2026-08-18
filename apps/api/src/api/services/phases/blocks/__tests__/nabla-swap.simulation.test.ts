import { afterAll, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import * as nablaNamespace from "../core/nabla";
import * as priceFeedNamespace from "../../../priceFeed.service";

const nablaReal = { ...nablaNamespace };
const priceFeedReal = { ...priceFeedNamespace };
const calculateNablaSwapOutputEvm = mock(async () => ({
  effectiveExchangeRate: "5",
  nablaOutputAmountDecimal: new Big("24887.892445"),
  nablaOutputAmountRaw: "24887892445000000000000"
}));

mock.module("../core/nabla", () => ({ calculateNablaSwapOutputEvm }));
mock.module("../../../priceFeed.service", () => ({
  priceFeedService: { getFiatToUsdExchangeRate: async () => new Big("0.2") }
}));

const { simulateNablaSwap } = await import("../phases/nabla-swap/simulation");

afterAll(() => {
  mock.module("../core/nabla", () => ({ ...nablaReal }));
  mock.module("../../../priceFeed.service", () => ({ ...priceFeedReal }));
});

describe("Nabla swap amount simulation", () => {
  it("uses the incoming raw amount without re-rounding its higher-precision decimal", async () => {
    const result = await simulateNablaSwap(
      Networks.Base,
      EvmToken.USDC,
      EvmToken.BRLA,
      {
        amount: new Big("4977.5784895"),
        amountRaw: "4977578489",
        chain: Networks.Base,
        token: EvmToken.USDC
      },
      {
        addNote() {},
        notes: [],
        now: new Date(),
        partner: null,
        request: {
          from: Networks.Base,
          inputAmount: "5000",
          inputCurrency: EvmToken.USDC,
          network: Networks.Base,
          outputCurrency: FiatToken.BRL,
          rampType: RampDirection.SELL,
          to: EPaymentMethod.PIX
        }
      }
    );

    expect(calculateNablaSwapOutputEvm).toHaveBeenCalledWith(
      expect.objectContaining({ inputAmountForSwap: "4977.578489" })
    );
    expect(result.metadata.inputAmountForSwapDecimal).toBe("4977.578489");
    expect(result.metadata.inputAmountForSwapRaw).toBe("4977578489");
  });
});
