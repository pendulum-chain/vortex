import { describe, expect, it } from "bun:test";
import { EvmToken, Networks, type RampPhase } from "@vortexfi/shared";
import { assemblePhaseFlow } from "../core/phase-flow";
import { getBlockExecutorFlows } from "../flows/catalog";
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

describe("dormant Polygon Monerium cross-chain flow", () => {
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

  it("keeps the settlement-blocked flow out of the production catalog", () => {
    expect(getBlockExecutorFlows().map(flow => flow.identity.id)).not.toContain("MoneriumOnrampPolygonCrossChain");
  });
});
