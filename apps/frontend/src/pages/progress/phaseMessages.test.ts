import { EPaymentMethod, EvmToken, FiatToken, Networks, RampPhase } from "@vortexfi/shared";
import { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { buildQuoteResponse, buildRampProcess } from "../../test/fixtures";
import { RampState } from "../../types/phases";
import { getMessageForPhase } from "./phaseMessages";

function buildRampState(
  phase: RampPhase,
  quoteOverrides: Parameters<typeof buildQuoteResponse>[0] = {}
): RampState {
  const quote = buildQuoteResponse(quoteOverrides);
  return {
    quote,
    ramp: buildRampProcess(phase, {
      from: quote.from,
      inputCurrency: quote.inputCurrency,
      outputCurrency: quote.outputCurrency,
      to: quote.to,
      type: quote.rampType
    }),
    requiredUserActionsCompleted: true,
    signedTransactions: [],
    userSigningMeta: {}
  };
}

function createTranslationSpy() {
  return vi.fn(() => "translated") as unknown as TFunction<"translation", undefined>;
}

describe("getMessageForPhase", () => {
  it("describes BRL and EUR SquidRouter transfers as originating on Base", () => {
    for (const inputCurrency of [FiatToken.BRL, FiatToken.EURC]) {
      const t = createTranslationSpy();
      const ramp = buildRampState("squidRouterSwap", {
        inputCurrency,
        outputCurrency: EvmToken.USDC,
        to: Networks.Arbitrum
      });

      getMessageForPhase(ramp, t);

      expect(t).toHaveBeenCalledWith("pages.progress.squidRouterSwap", {
        assetSymbol: "USDC",
        fromNetwork: "Base",
        toNetwork: "Arbitrum One"
      });
    }
  });

  it("describes AlfredPay SquidRouter transfers as originating on Polygon", () => {
    const t = createTranslationSpy();
    const ramp = buildRampState("squidRouterPay", {
      from: EPaymentMethod.CBU,
      inputCurrency: FiatToken.ARS,
      outputCurrency: EvmToken.USDC,
      to: Networks.Arbitrum
    });

    getMessageForPhase(ramp, t);

    expect(t).toHaveBeenCalledWith("pages.progress.squidRouterSwap", {
      assetSymbol: "USDC",
      fromNetwork: "Polygon",
      toNetwork: "Arbitrum One"
    });
  });

  it("uses same-chain wording when SquidRouter swaps on the destination network", () => {
    const t = createTranslationSpy();
    const ramp = buildRampState("squidRouterSwap", {
      inputCurrency: FiatToken.BRL,
      outputCurrency: EvmToken.USDT,
      to: Networks.Base
    });

    getMessageForPhase(ramp, t);

    expect(t).toHaveBeenCalledWith("pages.progress.squidRouterSameChainSwap", {
      assetSymbol: "USDT",
      network: "Base"
    });
  });
});
