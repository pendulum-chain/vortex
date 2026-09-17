import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
import { config } from "../../../../../config/vars";
import { assemblePhaseFlow } from "../core/phase-flow";
import { getBlockExecutorFlows, resolveBlockFlow } from "../flows/catalog";
import { makeMoneriumOnrampPolygonCrossChainFlow } from "../flows/monerium-onramp-polygon-cross-chain";

const expectedPhases: RampPhase[] = [
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
  "destinationTransfer"
];

describe("Polygon Monerium cross-chain flow", () => {
  it("pins Polygon issue, Uniswap conversion, Polygon fees/subsidy, and destination settlement", () => {
    const flow = makeMoneriumOnrampPolygonCrossChainFlow(Networks.Arbitrum, EvmToken.USDC, "1.25");

    expect(flow.phases).toEqual(expectedPhases);
    expect(flow.executors.map(executor => executor.getPhaseName())).toEqual(expectedPhases);
    expect(assemblePhaseFlow(flow)).toEqual(["initial", ...expectedPhases, "complete"]);
    expect(flow.contextKeys).toEqual([
      "moneriumIssue",
      "fundEphemeral",
      "moneriumSelfTransfer",
      "uniswapV3FixedSwap",
      "distributeFees",
      "subsidizePostSwap",
      "squidRouterSwap",
      "finalSettlementSubsidy",
      "destinationTransfer"
    ]);
  });

  it("is the production SEPA EUR onramp for non-Polygon destinations", () => {
    const request = {
      from: EPaymentMethod.SEPA,
      inputAmount: "100",
      inputCurrency: FiatToken.EURC,
      network: Networks.Arbitrum,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Arbitrum
    };

    expect(resolveBlockFlow(request).name).toBe("MoneriumOnrampPolygonCrossChain");
    expect(getBlockExecutorFlows().map(flow => flow.identity.id)).toContain("MoneriumOnrampPolygonCrossChain");
    expect(resolveBlockFlow({ ...request, network: Networks.Polygon, to: Networks.Polygon }).name).toBe(
      "MoneriumOnrampPolygonSameChain"
    );
  });

  it("refuses to quote with a public 503 while the issue fee is unconfigured", () => {
    const request = {
      from: EPaymentMethod.SEPA,
      inputAmount: "100",
      inputCurrency: FiatToken.EURC,
      network: Networks.Arbitrum,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Arbitrum
    };
    const originalIssueFee = config.monerium.issueFeeEur;
    config.monerium.issueFeeEur = undefined;
    try {
      expect(() => resolveBlockFlow(request)).toThrow(
        expect.objectContaining({ isPublic: true, message: "Monerium issue fee is not configured", status: 503 })
      );
    } finally {
      config.monerium.issueFeeEur = originalIssueFee;
    }
  });
});
