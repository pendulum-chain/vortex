import { describe, expect, it, mock } from "bun:test";
import {
  BrlaApiService,
  EPaymentMethod,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  Networks,
  RampDirection,
  type RampPhase
} from "@vortexfi/shared";
import Big from "big.js";

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
  calculateEvmBridgeAndNetworkFee: async ({ toToken }: { toToken: string }) => {
    const token = Object.values(evmTokenConfig[Networks.Base]).find(
      candidate => candidate?.erc20AddressSourceChain.toLowerCase() === toToken.toLowerCase()
    );
    return {
      finalEffectiveExchangeRate: "0.99",
      finalGrossOutputAmountDecimal: new Big("17.5"),
      networkFeeUSD: "0.1",
      outputTokenDecimals: token?.decimals ?? 6
    };
  },
  getBridgeTargetTokenDetails: (token: EvmToken) => evmTokenConfig[Networks.Base][token]
}));

mock.module("../../../priceFeed.service", () => ({
  priceFeedService: {
    convertCurrency: async (amount: string) => amount,
    getFiatToUsdExchangeRate: async () => new Big("0.18")
  }
}));

mock.module("../../../ramp/ramp.service", () => ({ default: {} }));

import {
  BRL_ONRAMP_BASE_SAME_CHAIN,
  BRL_ONRAMP_BASE_SAME_CHAIN_SWAP
} from "../../../phases/ramp-flow-definitions";
import { getBlockMetadata } from "../core/metadata";
import type { PhaseCtx } from "../core/types";
import { DestinationTransferContext } from "../phases/destination-transfer/simulation";
import { SubsidizePostContext } from "../phases/subsidize-post/simulation";
const { assemblePhaseFlow } = await import("../core/phase-flow");
const {
  brlOnrampBaseSameChainFlow,
  brlOnrampBaseSameChainPhaseFlow,
  brlOnrampBaseSameChainSwapPhaseFlow,
  makeBrlOnrampBaseSameChainSwapFlow
} = await import("../flows/brl-onramp-base-same-chain");

const ROUTED_BASE_OUTPUTS = [EvmToken.USDT, EvmToken.ETH, EvmToken.AXLUSDC, EvmToken.EURC] as const;
const COMMON_PHASES: RampPhase[] = [
  "brlaOnrampMint",
  "fundEphemeral",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "distributeFees",
  "subsidizePostSwap"
];

function buildCtx(outputCurrency: EvmToken): PhaseCtx {
  return {
    addNote() {},
    fees: {
      displayFiat: { anchor: "0.1", currency: FiatToken.BRL, network: "0", partnerMarkup: "0", total: "0.2", vortex: "0.1" },
      usd: { anchor: "0.1", network: "0", partnerMarkup: "0", total: "0.2", vortex: "0.1" }
    },
    notes: [],
    now: new Date(),
    partner: null,
    request: {
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.Base,
      outputCurrency,
      rampType: RampDirection.BUY,
      to: Networks.Base
    }
  };
}

async function simulate(outputCurrency: EvmToken) {
  BrlaApiService.getInstance = mock(() => ({
    createPayInQuote: mock(async (request: { inputCurrency: string }) => ({
      appliedFees: [{ amount: "0.2", type: "Gas Fee" }],
      outputAmount: request.inputCurrency === "BRL" ? "99" : "98.5",
      quoteToken: "mock-quote-token"
    }))
  })) as unknown as typeof BrlaApiService.getInstance;
  const flow =
    outputCurrency === EvmToken.USDC
      ? brlOnrampBaseSameChainFlow
      : makeBrlOnrampBaseSameChainSwapFlow(outputCurrency);
  return flow.simulate(buildCtx(outputCurrency));
}

describe("BRL Base same-chain block flows", () => {
  it("keeps Base USDC on the legacy no-Squid topology", () => {
    expect(brlOnrampBaseSameChainFlow.phases).toEqual([...COMMON_PHASES, "destinationTransfer"]);
    expect(brlOnrampBaseSameChainPhaseFlow).toEqual(BRL_ONRAMP_BASE_SAME_CHAIN);
    expect(brlOnrampBaseSameChainFlow.executors.map(executor => executor.getPhaseName())).toEqual([
      ...COMMON_PHASES,
      "destinationTransfer"
    ]);
  });

  it("uses the one-phase same-chain Squid topology for every routed Base output", () => {
    expect(brlOnrampBaseSameChainSwapPhaseFlow).toEqual(BRL_ONRAMP_BASE_SAME_CHAIN_SWAP);
    for (const outputCurrency of ROUTED_BASE_OUTPUTS) {
      const flow = makeBrlOnrampBaseSameChainSwapFlow(outputCurrency);
      expect(assemblePhaseFlow(flow)).toEqual(BRL_ONRAMP_BASE_SAME_CHAIN_SWAP);
      expect(flow.executors.map(executor => executor.getPhaseName())).toEqual([
        ...COMMON_PHASES,
        "squidRouterSwap",
        "destinationTransfer"
      ]);
      expect(flow.phases).not.toContain("squidRouterPay");
      expect(flow.phases).not.toContain("finalSettlementSubsidy");
    }
  });

  for (const outputCurrency of [EvmToken.USDC, ...ROUTED_BASE_OUTPUTS]) {
    it(`simulates BRL to Base ${outputCurrency} with phase-owned metadata`, async () => {
      const { metadata, output } = await simulate(outputCurrency);
      expect(output.chain).toBe(Networks.Base);
      expect(output.token).toBe(outputCurrency);
      expect(output.amount.gt(0)).toBe(true);
      expect(Object.hasOwn(metadata.blocks, "squidRouterSwap")).toBe(outputCurrency !== EvmToken.USDC);
      const destinationTransfer = getBlockMetadata(metadata, DestinationTransferContext);
      expect(destinationTransfer.network).toBe(Networks.Base);
      expect(destinationTransfer.token).toBe(outputCurrency);
      expect(metadata.globals.fees.usd.anchor).toBe("1.5");
      expect(getBlockMetadata(metadata, SubsidizePostContext).applied).toBe(false);
    });
  }
});
