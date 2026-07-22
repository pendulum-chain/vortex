import { describe, expect, it, mock } from "bun:test";
import {
  ALFREDPAY_EVM_TOKEN,
  AlfredpayApiService,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";

let squidCalculations = 0;

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
  calculateEvmBridgeAndNetworkFee: async ({ amountRaw }: { amountRaw: string }) => {
    squidCalculations++;
    return {
      finalEffectiveExchangeRate: "0.99",
      finalGrossOutputAmountDecimal: new Big(amountRaw).div(1_000_000).minus(1),
      networkFeeUSD: "1",
      outputTokenDecimals: 6
    };
  },
  getBridgeTargetTokenDetails: () => ({
    erc20AddressSourceChain: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
  })
}));

import { ALFREDPAY_ONRAMP_DIRECT } from "../../../phases/ramp-flow-definitions";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { PhaseCtx } from "../core/types";
import {
  alfredpayOnrampDirectFlow,
  alfredpayOnrampDirectPhaseFlow,
  makeAlfredpayOnrampDirectFlow
} from "../flows/alfredpay-onramp-direct";

const CORE_PHASES: RampPhase[] = [
  "alfredpayOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "squidRouterSwap",
  "finalSettlementSubsidy",
  "destinationTransfer"
];

function buildCtx(outputCurrency: EvmToken): PhaseCtx {
  return {
    addNote: () => undefined,
    notes: [],
    now: new Date(),
    partner: { id: null },
    request: {
      from: EPaymentMethod.SPEI,
      inputAmount: "100",
      inputCurrency: FiatToken.MXN,
      network: Networks.Polygon,
      outputCurrency,
      rampType: RampDirection.BUY,
      to: Networks.Polygon
    },
    targetFeeFiatCurrency: FiatToken.MXN
  };
}

describe("ALFREDPAY_ONRAMP_DIRECT block flow family", () => {
  it("derives the production phase flow and one executor per phase for both variants", () => {
    expect(alfredpayOnrampDirectFlow.phases).toEqual(CORE_PHASES);
    expect(alfredpayOnrampDirectPhaseFlow).toEqual(ALFREDPAY_ONRAMP_DIRECT);

    for (const token of [ALFREDPAY_EVM_TOKEN, EvmToken.USDC]) {
      const flow = makeAlfredpayOnrampDirectFlow(token);
      expect(assemblePhaseFlow(flow)).toEqual(ALFREDPAY_ONRAMP_DIRECT);
      expect(flow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    }
  });

  it("simulates direct-token passthrough without a provider route", async () => {
    AlfredpayApiService.getInstance = mock(() => ({
      createOnrampQuote: async () => ({
        expiration: new Date(Date.now() + 30_000).toISOString(),
        fees: [{ amount: "2", currency: FiatToken.MXN }],
        fromAmount: "100",
        quoteId: "alfred-quote",
        toAmount: "98"
      })
    })) as unknown as typeof AlfredpayApiService.getInstance;
    squidCalculations = 0;

    const { metadata, output } = await makeAlfredpayOnrampDirectFlow(ALFREDPAY_EVM_TOKEN).simulate(
      buildCtx(ALFREDPAY_EVM_TOKEN)
    );

    expect(squidCalculations).toBe(0);
    expect(output).toMatchObject({ amountRaw: "96000000", chain: Networks.Polygon, token: ALFREDPAY_EVM_TOKEN });
    expect(metadata.blocks.squidRouterSwap).toMatchObject({
      effectiveExchangeRate: "1",
      inputAmountRaw: "96000000",
      networkFeeUSD: "0",
      outputAmountRaw: "96000000"
    });
  });

  it("simulates a real same-chain Squid route for another Polygon token", async () => {
    squidCalculations = 0;
    const { metadata, output } = await makeAlfredpayOnrampDirectFlow(EvmToken.USDC).simulate(buildCtx(EvmToken.USDC));

    expect(squidCalculations).toBe(1);
    expect(output).toMatchObject({ amountRaw: "95000000", chain: Networks.Polygon, token: EvmToken.USDC });
    expect(metadata.blocks.squidRouterSwap).toMatchObject({
      inputAmountRaw: "96000000",
      outputAmountRaw: "95000000"
    });
  });
});
