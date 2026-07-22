import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, RampPhase } from "@vortexfi/shared";
import Big from "big.js";
import { BRL_OFFRAMP_BASE } from "../../../phases/ramp-flow-definitions";
import { assemblePhaseFlow } from "../core/phase-flow";
import { brlOfframpBaseFlow, makeBrlOfframpBaseFlow } from "../flows/brl-offramp-base";
import { resolveBlockFlow } from "../flows/catalog";
import { simulateEvmOfframpSource } from "../phases/evm-offramp-source/simulation";

const CORE_PHASES: RampPhase[] = [
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "brlaPayoutOnBase"
];

describe("BRL_OFFRAMP_BASE block flow", () => {
  it("preserves the legacy runtime phase family and executor coverage", () => {
    expect(brlOfframpBaseFlow.phases).toEqual(CORE_PHASES);
    expect(brlOfframpBaseFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    expect(assemblePhaseFlow(brlOfframpBaseFlow)).toEqual(BRL_OFFRAMP_BASE);
  });

  it("uses the same runtime family for direct, same-chain swap, and cross-chain sources", () => {
    for (const flow of [
      makeBrlOfframpBaseFlow(EvmToken.USDC, Networks.Base),
      makeBrlOfframpBaseFlow(EvmToken.BRLA, Networks.Base),
      makeBrlOfframpBaseFlow(EvmToken.USDC, Networks.Polygon)
    ]) {
      expect(flow.phases).toEqual(CORE_PHASES);
      expect(flow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    }
  });

  it("maps all supported EVM source variants to the family", () => {
    for (const [from, inputCurrency] of [
      [Networks.Base, EvmToken.USDC],
      [Networks.Base, EvmToken.BRLA],
      [Networks.Polygon, EvmToken.USDC]
    ] as const) {
      const flow = resolveBlockFlow({
        from,
        inputAmount: "100",
        inputCurrency,
        network: from,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL,
        to: EPaymentMethod.PIX
      });
      expect(flow.name).toBe("BrlOfframpBase");
      expect(flow.phases).toEqual(CORE_PHASES);
    }
  });

  it("passes direct Base USDC through without a Squid quote or network fee", async () => {
    const result = await simulateEvmOfframpSource(
      { amount: new Big(100), amountRaw: "100000000", chain: Networks.Base, token: EvmToken.USDC },
      {
        addNote() {},
        fees: {
          displayFiat: { anchor: "0", currency: FiatToken.BRL, network: "0", partnerMarkup: "0", total: "0", vortex: "0" },
          usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" }
        },
        notes: [],
        now: new Date(),
        partner: null,
        request: {
          from: Networks.Base,
          inputAmount: "100",
          inputCurrency: EvmToken.USDC,
          network: Networks.Base,
          outputCurrency: FiatToken.BRL,
          rampType: RampDirection.SELL,
          to: EPaymentMethod.PIX
        }
      }
    );

    expect(result.output).toMatchObject({ amountRaw: "100000000", chain: Networks.Base, token: EvmToken.USDC });
    expect(result.output.amount.toString()).toBe("100");
    expect(result.metadata).toMatchObject({ networkFeeUSD: "0", outputAmountRaw: "100000000" });
  });
});
