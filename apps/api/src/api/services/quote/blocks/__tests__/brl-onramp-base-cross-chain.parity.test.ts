import { describe, expect, it, mock } from "bun:test";
import Big from "big.js";
import { BrlaApiService, EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, RampPhase } from "@vortexfi/shared";

mock.module("../../core/nabla", () => ({
  calculateNablaSwapOutput: async () => {
    throw new Error("calculateNablaSwapOutput should not be called in EVM-only smoke test");
  },
  calculateNablaSwapOutputEvm: async () => ({
    effectiveExchangeRate: "0.18",
    nablaOutputAmountDecimal: new Big(18),
    nablaOutputAmountRaw: "18000000"
  })
}));

mock.module("../../core/squidrouter", () => ({
  calculateEvmBridgeAndNetworkFee: async () => ({
    finalEffectiveExchangeRate: "0.99",
    finalGrossOutputAmountDecimal: new Big(17.5),
    networkFeeUSD: "0.1",
    outputTokenDecimals: 6
  }),
  getBridgeTargetTokenDetails: () => ({
    erc20AddressSourceChain: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
  })
}));

mock.module("../../../priceFeed.service", () => ({
  priceFeedService: {
    getFiatToUsdExchangeRate: async () => new Big(0.18)
  }
}));

import { BRL_ONRAMP_BASE_CROSS_CHAIN } from "../../../phases/ramp-flow-definitions";
import { FlowBuilder } from "../core/flow";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { PhaseCtx } from "../core/types";
import type { SubsidyMeta } from "../phases/subsidize-pre";
import { AveniaMint } from "../phases/avenia-mint";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { NablaSwap } from "../phases/nabla-swap";
import { SquidRouterSwap } from "../phases/squid-router-swap";
import {
  brlOnrampBaseCrossChainFlow,
  brlOnrampBaseCrossChainPhaseFlow,
  makeBrlOnrampBaseCrossChainFlow
} from "../flows/brl-onramp-base-cross-chain";

const CORE_PHASES: RampPhase[] = [
  "brlaOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap",
  "squidRouterSwap",
  "squidRouterPay",
  "finalSettlementSubsidy",
  "destinationTransfer"
];

describe("BRL_ONRAMP_BASE_CROSS_CHAIN block flow — structure", () => {
  it("derives the core phases from the assembled blocks", () => {
    expect(brlOnrampBaseCrossChainFlow.phases).toEqual(CORE_PHASES);
  });

  it("assembles the phaseFlow matching the existing BRL_ONRAMP_BASE_CROSS_CHAIN", () => {
    expect(brlOnrampBaseCrossChainPhaseFlow).toEqual(BRL_ONRAMP_BASE_CROSS_CHAIN);
    expect(assemblePhaseFlow(brlOnrampBaseCrossChainFlow)).toEqual(BRL_ONRAMP_BASE_CROSS_CHAIN);
  });

  it("derives the same phaseFlow for every destination in the flow family", () => {
    expect(assemblePhaseFlow(makeBrlOnrampBaseCrossChainFlow(Networks.Polygon, EvmToken.USDT))).toEqual(
      BRL_ONRAMP_BASE_CROSS_CHAIN
    );
    expect(assemblePhaseFlow(makeBrlOnrampBaseCrossChainFlow(Networks.Ethereum, EvmToken.USDC))).toEqual(
      BRL_ONRAMP_BASE_CROSS_CHAIN
    );
  });
});

describe("BRL_ONRAMP_BASE_CROSS_CHAIN block flow — executors", () => {
  it("provides exactly one executor per phase, in flow order", () => {
    expect(brlOnrampBaseCrossChainFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
  });

  it("provides executors for every destination in the flow family", () => {
    const flow = makeBrlOnrampBaseCrossChainFlow(Networks.Polygon, EvmToken.USDT);
    expect(flow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
  });
});

describe("BRL_ONRAMP_BASE_CROSS_CHAIN block flow — compile-time adjacency", () => {
  it.skip("rejects brand mismatches at compile time", () => {
    // AveniaMint outputs BRLA on Base; a EURC-input swap cannot follow.
    // @ts-expect-error adjacency: NablaSwap input brand (EURC) != AveniaMint output brand (BRLA)
    const _wrongToken = FlowBuilder.start(AveniaMint).pipe(NablaSwap(Networks.Base, EvmToken.EURC, EvmToken.USDC));
    void _wrongToken;

    // The bridge lands on Arbitrum; a Base-only phase cannot follow.
    const bridged = FlowBuilder.start(SquidRouterSwap(Networks.Base, Networks.Arbitrum, EvmToken.USDC, EvmToken.USDC));
    // @ts-expect-error adjacency: DistributeFees chain brand (base) != bridge output chain (arbitrum)
    const _wrongChain = bridged.pipe(DistributeFees<typeof EvmToken.USDC, typeof Networks.Base>());
    void _wrongChain;

    const funded = FlowBuilder.start(FundEphemeral(EvmToken.USDC, Networks.Base));
    // @ts-expect-error ownership: one flow cannot contain the same metadata key twice
    const _duplicateKey = funded.pipe(FundEphemeral(EvmToken.USDC, Networks.Base));
    void _duplicateKey;

  });
});

function buildCtx(): PhaseCtx {
  const notes: string[] = [];
  return {
    addNote: (note: string) => {
      notes.push(note);
    },
    fees: {
      usd: { anchor: "0.1", network: "0.1", partnerMarkup: "0", total: "0.3", vortex: "0.1" }
    },
    notes,
    now: new Date(),
    partner: null,
    request: {
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.Base,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Arbitrum
    }
  };
}

async function runFlow(flow: typeof brlOnrampBaseCrossChainFlow) {
  BrlaApiService.getInstance = mock(() => ({
    createPayInQuote: mock(async (request: { inputCurrency: string }) => ({
      appliedFees: [{ amount: "0.2", type: "Gas Fee" }],
      outputAmount: request.inputCurrency === "BRL" ? "99" : "98.5",
      quoteToken: "mock-quote-token"
    }))
  })) as unknown as typeof BrlaApiService.getInstance;

  return flow.simulate(buildCtx());
}

describe("BRL_ONRAMP_BASE_CROSS_CHAIN block flow — simulate smoke", () => {
  it("runs the flow end-to-end and lands on the destination token", async () => {
    const { output } = await runFlow(brlOnrampBaseCrossChainFlow);
    expect(output.amount.gt(0)).toBe(true);
    expect(output.token).toBe(EvmToken.USDC);
    expect(output.chain).toBe(Networks.Arbitrum);
  });
});

describe("BRL_ONRAMP_BASE_CROSS_CHAIN block flow — metadata ownership", () => {
  it("accumulates one context per block beneath explicit globals", async () => {
    const { metadata } = await runFlow(brlOnrampBaseCrossChainFlow);
    const { blocks, globals } = metadata;

    expect(globals.fees.usd.total).toBe("0.3");
    expect(Object.keys(blocks)).toEqual([
      "aveniaMint",
      "fundEphemeral",
      "subsidizePreSwap",
      "nablaSwap",
      "distributeFees",
      "subsidizePostSwap",
      "squidRouterSwap",
      "finalSettlementSubsidy",
      "destinationTransfer"
    ]);

    const aveniaMint = blocks.aveniaMint.mint;
    expect(aveniaMint).toBeDefined();
    expect(aveniaMint.currency).toBe(FiatToken.BRL);
    // 100 BRL in, 99 BRLA quoted -> 1 BRL mint fee, 0.2 gas fee deducted from delivery
    expect(Big(aveniaMint.fee).toFixed()).toBe("1");
    expect(Big(aveniaMint.inputAmountDecimal).toFixed()).toBe("100");
    expect(Big(aveniaMint.outputAmountDecimal).toFixed()).toBe("98.8");

    const aveniaTransfer = blocks.aveniaMint.transfer;
    expect(aveniaTransfer).toBeDefined();
    expect(Big(aveniaTransfer.inputAmountDecimal).toFixed()).toBe("98.8");
    // transfer quote outputs 98.5, minus the 0.2 gas-fee buffer ((0.2 + 0.2) * 0.5)
    expect(Big(aveniaTransfer.outputAmountDecimal).toFixed()).toBe("98.3");

    const nabla = blocks.nablaSwap;
    expect(nabla).toBeDefined();
    expect(nabla.inputCurrency).toBe(EvmToken.BRLA);
    expect(nabla.outputCurrency).toBe(EvmToken.USDC);
    expect(nabla.outputAmountRaw).toBe("18000000");
    expect(nabla.effectiveExchangeRate).toBe("0.18");

    const evmToEvm = blocks.squidRouterSwap;
    expect(evmToEvm).toBeDefined();
    expect(evmToEvm.fromNetwork).toBe(Networks.Base);
    expect(evmToEvm.toNetwork).toBe(Networks.Arbitrum);
    expect(evmToEvm.inputAmountRaw).toBeDefined();
    expect(evmToEvm.outputAmountRaw).toBe("17500000");
    expect(evmToEvm.networkFeeUSD).toBe("0.1");

    const subsidy: SubsidyMeta = blocks.finalSettlementSubsidy;
    expect(subsidy).toBeDefined();
    expect(subsidy.applied).toBe(false);
    expect(Big(subsidy.actualOutputAmountDecimal).gt(0)).toBe(true);
    expect(subsidy.partnerId).toBeNull();
    expect(blocks.subsidizePreSwap.inputCurrency).toBe(EvmToken.BRLA);
    expect(blocks.subsidizePostSwap.outputCurrency).toBe(EvmToken.USDC);
    expect(blocks.destinationTransfer.amountRaw).toBe("17500000");
  });
});
