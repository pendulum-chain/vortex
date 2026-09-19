import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
const EUR_OFFRAMP_BASE: RampPhase[] = [
  "initial",
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "mykoboPayoutOnBase",
  "complete"
];
import { assemblePhaseFlow } from "../core/phase-flow";
import { eurOfframpBaseFlow, makeEurOfframpBaseFlow } from "../flows/eur-offramp-base";
import { resolveBlockFlow } from "../flows/catalog";

const CORE_PHASES: RampPhase[] = [
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "mykoboPayoutOnBase"
];

describe("EUR Base offramp flow", () => {
  it("preserves phase topology and executor coverage", () => {
    expect(eurOfframpBaseFlow.phases).toEqual(CORE_PHASES);
    expect(eurOfframpBaseFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    expect(assemblePhaseFlow(eurOfframpBaseFlow)).toEqual(EUR_OFFRAMP_BASE);
  });

  it("uses the same runtime topology for direct, same-chain swap, and cross-chain sources", () => {
    for (const flow of [
      makeEurOfframpBaseFlow(EvmToken.USDC, Networks.Base),
      makeEurOfframpBaseFlow(EvmToken.EURC, Networks.Base),
      makeEurOfframpBaseFlow(EvmToken.USDC, Networks.Polygon)
    ]) {
      expect(flow.phases).toEqual(CORE_PHASES);
      expect(flow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    }
  });

  it("keeps legacy topology executable but rejects new EUR offramp quotes", () => {
    for (const [from, inputCurrency] of [
      [Networks.Base, EvmToken.USDC],
      [Networks.Base, EvmToken.EURC],
      [Networks.Polygon, EvmToken.USDC]
    ] as const) {
      expect(() =>
        resolveBlockFlow({
          from,
          inputAmount: "100",
          inputCurrency,
          network: from,
          outputCurrency: FiatToken.EURC,
          rampType: RampDirection.SELL,
          to: EPaymentMethod.SEPA
        })
      ).toThrow("No block flow mapped");
    }
    expect(() =>
      resolveBlockFlow({
        from: Networks.Base,
        inputAmount: "100",
        inputCurrency: EvmToken.USDC,
        network: Networks.Base,
        outputCurrency: FiatToken.EURC,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.PIX
      })
    ).toThrow();
  });
});
