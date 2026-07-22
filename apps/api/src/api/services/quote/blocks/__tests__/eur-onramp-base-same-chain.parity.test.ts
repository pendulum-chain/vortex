import { afterAll, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, evmTokenConfig, FiatToken, MykoboApiService, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
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
  calculateEvmBridgeAndNetworkFee: async ({ toToken }: { toToken: string }) => {
    const token = Object.values(evmTokenConfig[Networks.Base]).find(
      candidate => candidate?.erc20AddressSourceChain.toLowerCase() === toToken.toLowerCase()
    );
    return {
      finalEffectiveExchangeRate: "0.99",
      finalGrossOutputAmountDecimal: new Big("107.5"),
      networkFeeUSD: "0.1",
      outputTokenDecimals: token?.decimals ?? 6
    };
  },
  getBridgeTargetTokenDetails: (token: EvmToken) => evmTokenConfig[Networks.Base][token]
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

import {
  EUR_ONRAMP_BASE_SAME_CHAIN,
  EUR_ONRAMP_BASE_SAME_CHAIN_SWAP
} from "../../../phases/ramp-flow-definitions";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { PhaseCtx } from "../core/types";
import {
  eurOnrampBaseSameChainFlow,
  eurOnrampBaseSameChainPhaseFlow,
  eurOnrampBaseSameChainSwapPhaseFlow,
  makeEurOnrampBaseSameChainSwapFlow
} from "../flows/eur-onramp-base-same-chain";

const ROUTED_BASE_OUTPUTS = [EvmToken.USDT, EvmToken.ETH, EvmToken.AXLUSDC, EvmToken.BRLA] as const;
const COMMON_PHASES: RampPhase[] = [
  "mykoboOnrampDeposit",
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
    fees: EXPECTED_FEES,
    notes: [],
    now: new Date(),
    partner: null,
    request: {
      from: EPaymentMethod.SEPA,
      inputAmount: "100",
      inputCurrency: FiatToken.EURC,
      network: Networks.Base,
      outputCurrency,
      rampType: RampDirection.BUY,
      to: Networks.Base
    }
  };
}

async function simulate(outputCurrency: EvmToken) {
  MykoboApiService.getInstance = mock(() => ({
    defaultDepositFee: mock(async () => ({ total: "0.06" }))
  })) as unknown as typeof MykoboApiService.getInstance;
  const flow =
    outputCurrency === EvmToken.USDC
      ? eurOnrampBaseSameChainFlow
      : makeEurOnrampBaseSameChainSwapFlow(outputCurrency);
  return flow.simulate(buildCtx(outputCurrency));
}

describe("EUR Base same-chain block flows", () => {
  it("keeps Base USDC on EUR_ONRAMP_BASE_SAME_CHAIN without Squid", () => {
    expect(eurOnrampBaseSameChainFlow.phases).toEqual([...COMMON_PHASES, "destinationTransfer"]);
    expect(eurOnrampBaseSameChainPhaseFlow).toEqual(EUR_ONRAMP_BASE_SAME_CHAIN);
    expect(eurOnrampBaseSameChainFlow.executors.map(executor => executor.getPhaseName())).toEqual([
      ...COMMON_PHASES,
      "destinationTransfer"
    ]);
  });

  it("uses one same-chain Squid phase for every other supported Base output", () => {
    expect(eurOnrampBaseSameChainSwapPhaseFlow).toEqual(EUR_ONRAMP_BASE_SAME_CHAIN_SWAP);
    for (const outputCurrency of ROUTED_BASE_OUTPUTS) {
      const flow = makeEurOnrampBaseSameChainSwapFlow(outputCurrency);
      expect(assemblePhaseFlow(flow)).toEqual(EUR_ONRAMP_BASE_SAME_CHAIN_SWAP);
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
    it(`simulates EUR to Base ${outputCurrency} with provider fee and metadata parity`, async () => {
      const { metadata, output } = await simulate(outputCurrency);
      expect(output.chain).toBe(Networks.Base);
      expect(output.token).toBe(outputCurrency);
      expect(output.amount.gt(0)).toBe(true);
      expect(Object.hasOwn(metadata.blocks, "squidRouterSwap")).toBe(outputCurrency !== EvmToken.USDC);
      expect(metadata.blocks.mykoboMint.mint.outputAmountRaw).toBe("99940000");
      expect(metadata.blocks.destinationTransfer.network).toBe(Networks.Base);
      expect(metadata.blocks.destinationTransfer.token).toBe(outputCurrency);
      expect(feeOverride).toEqual({
        anchor: { amount: "0.06", currency: FiatToken.EURC },
        network: { amount: "0.1", currency: EvmToken.USDC }
      });
    });
  }
});
