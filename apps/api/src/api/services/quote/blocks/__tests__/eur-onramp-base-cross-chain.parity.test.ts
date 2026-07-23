import { afterAll, describe, expect, it, mock } from "bun:test";
import {
  EPaymentMethod,
  EvmToken,
  FiatToken,
  MykoboApiService,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import Big from "big.js";
import * as nablaNamespace from "../../core/nabla";
import * as squidrouterNamespace from "../../core/squidrouter";
import * as priceFeedNamespace from "../../../priceFeed.service";
import * as feesNamespace from "../core/fees";

const feesReal = { ...feesNamespace };
const nablaReal = { ...nablaNamespace };
const priceFeedReal = { ...priceFeedNamespace };
const squidrouterReal = { ...squidrouterNamespace };

const EXPECTED_FEES = {
  displayFiat: { anchor: "0.06", currency: FiatToken.EURC, network: "0.1", partnerMarkup: "0", total: "0.26", vortex: "0.1" },
  usd: { anchor: "0.06", network: "0.1", partnerMarkup: "0", total: "0.26", vortex: "0.1" }
};
let feeOverride: unknown;

mock.module("../core/fees", () => ({
  calculateFees: async (_ctx: unknown, override: unknown) => {
    feeOverride = override;
    return EXPECTED_FEES;
  },
  computeFees: async (ctx: { fees?: unknown }) => {
    ctx.fees ??= EXPECTED_FEES;
  }
}));

mock.module("../../core/nabla", () => ({
  calculateNablaSwapOutputEvm: async () => ({
    effectiveExchangeRate: "1.08",
    nablaOutputAmountDecimal: new Big("107.9352"),
    nablaOutputAmountRaw: "107935200"
  })
}));

mock.module("../../core/squidrouter", () => ({
  calculateEvmBridgeAndNetworkFee: async () => ({
    finalEffectiveExchangeRate: "0.99",
    finalGrossOutputAmountDecimal: new Big("107.5"),
    networkFeeUSD: "0.1",
    outputTokenDecimals: 6
  }),
  getBridgeTargetTokenDetails: () => ({
    erc20AddressSourceChain: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
  })
}));

mock.module("../../../priceFeed.service", () => ({
  priceFeedService: { getFiatToUsdExchangeRate: async () => new Big("1.08") }
}));

afterAll(() => {
  mock.module("../core/fees", () => ({ ...feesReal }));
  mock.module("../../core/nabla", () => ({ ...nablaReal }));
  mock.module("../../core/squidrouter", () => ({ ...squidrouterReal }));
  mock.module("../../../priceFeed.service", () => ({ ...priceFeedReal }));
});

import { EUR_ONRAMP_BASE_CROSS_CHAIN } from "../../../phases/ramp-flow-definitions";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { getBlockMetadata } from "../core/metadata";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { PhaseCtx } from "../core/types";
import {
  eurOnrampBaseCrossChainFlow,
  eurOnrampBaseCrossChainPhaseFlow,
  makeEurOnrampBaseCrossChainFlow
} from "../flows/eur-onramp-base-cross-chain";
import { DestinationTransferContext } from "../phases/destination-transfer/simulation";
import { MykoboMint } from "../phases/mykobo-mint";
import { MykoboMintContext } from "../phases/mykobo-mint/simulation";
import { NablaSwap } from "../phases/nabla-swap";
import { NablaSwapContext } from "../phases/nabla-swap/simulation";
import { SquidRouterSwapContext } from "../phases/squid-router-swap/simulation";

const CORE_PHASES: RampPhase[] = [
  "mykoboOnrampDeposit",
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

function buildCtx(): PhaseCtx {
  return {
    addNote: note => void note,
    fees: EXPECTED_FEES,
    notes: [],
    now: new Date(),
    partner: null,
    request: {
      from: EPaymentMethod.SEPA,
      inputAmount: "100",
      inputCurrency: FiatToken.EURC,
      network: Networks.Arbitrum,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Arbitrum
    }
  };
}

async function runFlow() {
  MykoboApiService.getInstance = mock(() => ({
    defaultDepositFee: mock(async () => ({ total: "0.06" }))
  })) as unknown as typeof MykoboApiService.getInstance;
  return eurOnrampBaseCrossChainFlow.simulate(buildCtx());
}

describe("EUR_ONRAMP_BASE_CROSS_CHAIN block flow", () => {
  it("matches the legacy phase flow for every non-Base EVM destination", () => {
    expect(eurOnrampBaseCrossChainFlow.phases).toEqual(CORE_PHASES);
    expect(eurOnrampBaseCrossChainPhaseFlow).toEqual(EUR_ONRAMP_BASE_CROSS_CHAIN);
    expect(assemblePhaseFlow(makeEurOnrampBaseCrossChainFlow(Networks.Polygon, EvmToken.USDT))).toEqual(
      EUR_ONRAMP_BASE_CROSS_CHAIN
    );
  });

  it("provides exactly one executor per phase", () => {
    expect(eurOnrampBaseCrossChainFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
  });

  it.skip("rejects typed adjacency mismatches", () => {
    // @ts-expect-error Mykobo emits Base EURC, not Base BRLA
    const wrongToken = FlowBuilder.start(fiatRequestIO(FiatToken.EURC), MykoboMint).pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC));
    void wrongToken;
  });

  it("simulates to the requested destination with provider fee parity", async () => {
    const { output } = await runFlow();
    expect(output.amount.toFixed()).toBe("107.5");
    expect(output.token).toBe(EvmToken.USDC);
    expect(output.chain).toBe(Networks.Arbitrum);
    expect(feeOverride).toEqual({
      anchor: { amount: "0.06", currency: FiatToken.EURC },
      network: { amount: "0.1", currency: EvmToken.USDC }
    });
  });

  it("owns one metadata entry per phase and preserves Mykobo mint amounts", async () => {
    const { metadata } = await runFlow();
    expect(Object.keys(metadata.blocks)).toEqual([
      "mykoboMint",
      "fundEphemeral",
      "subsidizePreSwap",
      "nablaSwap",
      "distributeFees",
      "subsidizePostSwap",
      "squidRouterSwap",
      "finalSettlementSubsidy",
      "destinationTransfer"
    ]);
    const mykoboMint = getBlockMetadata(metadata, MykoboMintContext);
    expect(mykoboMint.mint).toMatchObject({
      currency: FiatToken.EURC,
      inputAmountRaw: "100000000",
      outputAmountRaw: "99940000"
    });
    expect(Big(mykoboMint.mint.fee).toFixed()).toBe("0.06");
    const nablaSwap = getBlockMetadata(metadata, NablaSwapContext);
    expect(nablaSwap.inputCurrency).toBe(EvmToken.EURC);
    expect(nablaSwap.outputCurrency).toBe(EvmToken.USDC);
    expect(getBlockMetadata(metadata, SquidRouterSwapContext).toNetwork).toBe(Networks.Arbitrum);
    expect(getBlockMetadata(metadata, DestinationTransferContext).amountRaw).toBe("107500000");
  });
});
