import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
import { assemblePhaseFlow } from "../core/phase-flow";
import { getBlockExecutorFlows, resolveBlockFlow, resolvePersistedBlockFlow } from "../flows/catalog";
import { makeMoneriumOnrampPolygonSameChainFlow } from "../flows/monerium-onramp-polygon-same-chain";

const polygonPrefix: RampPhase[] = [
  "moneriumOnrampMint",
  "fundEphemeral",
  "moneriumOnrampSelfTransfer",
  "uniswapApprove",
  "uniswapSwap",
  "distributeFees",
  "subsidizePostSwap"
];

const request = {
  from: EPaymentMethod.SEPA,
  inputAmount: "100",
  inputCurrency: FiatToken.EURC,
  network: Networks.Polygon,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Polygon
};

describe("Polygon Monerium same-chain flow", () => {
  it("settles Polygon USDC straight from the fee-settled swap output", () => {
    const flow = makeMoneriumOnrampPolygonSameChainFlow(EvmToken.USDC, "1.25");

    expect(flow.phases).toEqual([...polygonPrefix, "destinationTransfer"]);
    expect(assemblePhaseFlow(flow)).toEqual(["initial", ...polygonPrefix, "destinationTransfer", "complete"]);
    expect(flow.contextKeys).not.toContain("squidRouterSwap");
  });

  it("adds one same-chain Squid swap for other Polygon tokens", () => {
    const flow = makeMoneriumOnrampPolygonSameChainFlow(EvmToken.USDT, "1.25");

    expect(flow.phases).toEqual([...polygonPrefix, "squidRouterSwap", "destinationTransfer"]);
    expect(flow.phases).not.toContain("squidRouterPay");
  });

  it("owns Polygon destinations in the catalog and resolves its persisted variants", () => {
    expect(getBlockExecutorFlows().map(flow => flow.identity.id)).toContain("MoneriumOnrampPolygonSameChain");
    for (const outputCurrency of [EvmToken.USDC, EvmToken.USDT]) {
      const flow = resolveBlockFlow({ ...request, outputCurrency });
      expect(flow.name).toBe("MoneriumOnrampPolygonSameChain");
      const metadata = {
        blocks: Object.fromEntries(flow.contextKeys.map(key => [key, {}])),
        flow: flow.identity,
        globals: {
          fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
          partner: null,
          request: { ...request, outputCurrency }
        }
      };
      expect(resolvePersistedBlockFlow(metadata).phases).toEqual(flow.phases);
    }
    expect(resolveBlockFlow({ ...request, network: Networks.Arbitrum, to: Networks.Arbitrum }).name).toBe(
      "MoneriumOnrampPolygonCrossChain"
    );
  });
});
