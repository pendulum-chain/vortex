import { describe, expect, it, mock } from "bun:test";
import {
  AlfredpayApiService,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";

mock.module("../../core/quote-fees", () => ({
  calculateFeeComponents: async () => ({
    anchorFee: "0",
    feeCurrency: FiatToken.MXN,
    partnerMarkupFee: "1",
    vortexFee: "1"
  })
}));

mock.module("../../../priceFeed.service", () => ({
  priceFeedService: {
    convertCurrency: async (amount: string) => amount,
    getFiatToUsdExchangeRate: async () => new Big(1)
  }
}));

mock.module("../../../partners/partner-pricing.service", () => ({
  findPartnerWithPricing: async () => ({
    id: "vortex-partner",
    maxDynamicDifference: 0,
    maxSubsidy: 0,
    minDynamicDifference: 0,
    name: "vortex",
    rampType: RampDirection.BUY,
    targetDiscount: 0
  })
}));

mock.module("../../core/squidrouter", () => ({
  calculateEvmBridgeAndNetworkFee: async ({ amountRaw }: { amountRaw: string }) => ({
    finalEffectiveExchangeRate: "0.99",
    finalGrossOutputAmountDecimal: new Big(amountRaw).div(1_000_000).minus(1),
    networkFeeUSD: "1",
    outputTokenDecimals: 6
  }),
  getBridgeTargetTokenDetails: () => ({
    erc20AddressSourceChain: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
  })
}));

import { ALFREDPAY_ONRAMP_CROSS_CHAIN } from "../../../phases/ramp-flow-definitions";
import { FlowBuilder } from "../core/flow";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { PhaseCtx } from "../core/types";
import { AlfredpayMint } from "../phases/alfredpay-mint";
import { FundEphemeral } from "../phases/fund-ephemeral";
import {
  alfredpayOnrampCrossChainFlow,
  alfredpayOnrampCrossChainPhaseFlow,
  makeAlfredpayOnrampCrossChainFlow
} from "../flows/alfredpay-onramp-cross-chain";

const CORE_PHASES: RampPhase[] = [
  "alfredpayOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "squidRouterSwap",
  "squidRouterPay",
  "finalSettlementSubsidy",
  "destinationTransfer"
];

function buildCtx(): PhaseCtx {
  return {
    addNote: () => undefined,
    notes: [],
    now: new Date(),
    partner: { id: null },
    request: {
      from: EPaymentMethod.SPEI,
      inputAmount: "100",
      inputCurrency: FiatToken.MXN,
      network: Networks.Arbitrum,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Arbitrum
    },
    targetFeeFiatCurrency: FiatToken.MXN
  };
}

describe("ALFREDPAY_ONRAMP_CROSS_CHAIN block flow", () => {
  it("derives the production phase flow and executor order", () => {
    expect(alfredpayOnrampCrossChainFlow.phases).toEqual(CORE_PHASES);
    expect(alfredpayOnrampCrossChainPhaseFlow).toEqual(ALFREDPAY_ONRAMP_CROSS_CHAIN);
    expect(assemblePhaseFlow(makeAlfredpayOnrampCrossChainFlow(Networks.Base, EvmToken.USDC))).toEqual(
      ALFREDPAY_ONRAMP_CROSS_CHAIN
    );
    expect(alfredpayOnrampCrossChainFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
  });

  it.skip("rejects incompatible adjacency at compile time", () => {
    // @ts-expect-error AlfredpayMint outputs USDT on Polygon, not Base.
    const wrongChain = FlowBuilder.start(AlfredpayMint).pipe(FundEphemeral(EvmToken.USDT, Networks.Base));
    void wrongChain;
  });

  it("simulates provider fees before subsidy and bridges the resulting amount", async () => {
    AlfredpayApiService.getInstance = mock(() => ({
      createOnrampQuote: async () => ({
        expiration: new Date(Date.now() + 30_000).toISOString(),
        fees: [{ amount: "2", currency: FiatToken.MXN }],
        fromAmount: "100",
        quoteId: "alfred-quote",
        toAmount: "98"
      })
    })) as unknown as typeof AlfredpayApiService.getInstance;

    const { metadata, output } = await alfredpayOnrampCrossChainFlow.simulate(buildCtx());

    expect(output.token).toBe(EvmToken.USDC);
    expect(output.chain).toBe(Networks.Arbitrum);
    expect(output.amount.toFixed()).toBe("95");
    expect(metadata.globals.fees.usd).toEqual({
      anchor: "2",
      network: "0",
      partnerMarkup: "1",
      total: "4.000000",
      vortex: "1"
    });
    expect(Object.keys(metadata.blocks)).toEqual([
      "alfredpayMint",
      "fundEphemeral",
      "subsidizePreSwap",
      "squidRouterSwap",
      "finalSettlementSubsidy",
      "destinationTransfer"
    ]);
    expect(metadata.blocks.alfredpayMint.outputAmountRaw).toBe("98000000");
    expect(metadata.blocks.subsidizePreSwap.targetInputAmountRaw).toBe("96000000");
    expect(metadata.blocks.squidRouterSwap.inputAmountRaw).toBe("96000000");
  });
});
