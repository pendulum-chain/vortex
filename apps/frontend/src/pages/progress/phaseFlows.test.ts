import { EvmToken, FiatToken, Networks, RampPhase } from "@vortexfi/shared";
import { describe, expect, it } from "vitest";
import { buildQuoteResponse, buildRampProcess } from "../../test/fixtures";
import { RampState } from "../../types/phases";
import { getRampFlow, PHASE_FLOWS } from "./phaseFlows";

// The phases the API's MoneriumOnrampPolygonCrossChain flow emits, in order
// (apps/api/.../flows/monerium-onramp-polygon-cross-chain.ts).
const MONERIUM_ONRAMP_PHASES: RampPhase[] = [
  "initial",
  "moneriumOnrampMint",
  "fundEphemeral",
  "moneriumOnrampSelfTransfer",
  "uniswapApprove",
  "uniswapSwap",
  "distributeFees",
  "subsidizePostSwap",
  "squidRouterSwap",
  "squidRouterPay",
  "finalSettlementSubsidy",
  "destinationTransfer",
  "complete"
];

function buildRampState(phase: RampPhase, quoteOverrides: Parameters<typeof buildQuoteResponse>[0]): RampState {
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

describe("getRampFlow", () => {
  it("routes an EUR pay-in to the Monerium sequence", () => {
    const rampState = buildRampState("moneriumOnrampMint", {
      inputCurrency: FiatToken.EURC,
      outputCurrency: EvmToken.USDC,
      to: Networks.Arbitrum
    });

    expect(getRampFlow(rampState)).toBe("onramp_eur_monerium");
  });

  it("indexes every Monerium phase monotonically so the progress ring never rewinds", () => {
    const sequence = PHASE_FLOWS.onramp_eur_monerium;
    const indexes = MONERIUM_ONRAMP_PHASES.map(phase => sequence.indexOf(phase));

    expect(indexes.every(index => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });
});
