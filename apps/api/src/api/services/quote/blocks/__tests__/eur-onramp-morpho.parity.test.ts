import { describe, expect, it, mock } from "bun:test";
import Big from "big.js";
import { EvmClientManager, EvmToken, EPaymentMethod, FiatToken, MykoboApiService, Networks, RampDirection } from "@vortexfi/shared";

mock.module("../../core/nabla", () => ({
  calculateNablaSwapOutput: async () => {
    throw new Error("calculateNablaSwapOutput should not be called in EVM-only smoke test");
  },
  calculateNablaSwapOutputEvm: async () => ({
    effectiveExchangeRate: "1.05",
    nablaOutputAmountDecimal: new Big(105),
    nablaOutputAmountRaw: "105000000"
  })
}));

mock.module("../../core/squidrouter", () => ({
  calculateEvmBridgeAndNetworkFee: async () => ({
    finalEffectiveExchangeRate: "0.95",
    finalGrossOutputAmountDecimal: new Big(95),
    networkFeeUSD: "0.1",
    outputTokenDecimals: 6
  }),
  getBridgeTargetTokenDetails: () => ({
    erc20AddressSourceChain: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
  })
}));

mock.module("../../../priceFeed.service", () => ({
  priceFeedService: {
    getOnchainOraclePrice: async () => ({
      lastUpdateTimestamp: 0,
      name: "mock",
      price: new Big(1)
    })
  }
}));

import { EUR_ONRAMP_BASE_MORPHO, EUR_ONRAMP_MORPHO } from "../../../phases/ramp-flow-definitions";
import { FlowBuilder } from "../core/flow";
import type { PhaseCtx, PhaseIO } from "../core/types";
import { MorphoMint } from "../phases/morpho-mint";
import { MykoboMint } from "../phases/mykobo-mint";
import { eurOnrampMorphoBasePhaseFlow, eurOnrampMorphoFlow, eurOnrampMorphoPhaseFlow } from "../flows/eur-onramp-morpho";

describe("EUR_ONRAMP_MORPHO block flow — structure", () => {
  it("derives the core phases from the assembled blocks", () => {
    expect(eurOnrampMorphoFlow.phases).toEqual([
      "mykoboOnrampDeposit",
      "subsidizePreSwap",
      "nablaApprove",
      "nablaSwap",
      "subsidizePostSwap",
      "squidRouterSwap",
      "squidRouterPay",
      "morphoDeposit"
    ]);
  });

  it("assembles the cross-chain phaseFlow matching the existing EUR_ONRAMP_MORPHO", () => {
    expect(eurOnrampMorphoPhaseFlow).toEqual(EUR_ONRAMP_MORPHO);
  });

  it("assembles the base-vault phaseFlow matching the existing EUR_ONRAMP_BASE_MORPHO", () => {
    expect(eurOnrampMorphoBasePhaseFlow).toEqual(EUR_ONRAMP_BASE_MORPHO);
  });
});

describe("EUR_ONRAMP_MORPHO block flow — compile-time adjacency", () => {
  it.skip("rejects a mis-ordered flow at compile time (MorphoMint before MykoboMint)", () => {
    // MorphoMint expects USDC input; MykoboMint expects EUR/fiat input.
    // @ts-expect-error adjacency: MorphoMint input brand (USDC) != MykoboMint input brand (EUR/fiat)
    const _wrong = FlowBuilder.start(MorphoMint<Networks.Base | Networks.Arbitrum>()).pipe(MykoboMint).build("wrong");
    void _wrong;
  });
});

describe("EUR_ONRAMP_MORPHO block flow — simulate smoke", () => {
  it("runs the assembled flow end-to-end with mocked externals and lands on MORPHO_VAULT", async () => {
    MykoboApiService.getInstance = mock(() => ({
      defaultDepositFee: mock(async () => ({ total: "0.5" }))
    })) as unknown as typeof MykoboApiService.getInstance;

    EvmClientManager.getInstance = mock(() => ({
      getClient: mock(() => ({
        readContract: mock(async () => 1000000000000000000n)
      }))
    })) as unknown as typeof EvmClientManager.getInstance;

    const notes: string[] = [];
    const ctx: PhaseCtx = {
      addNote: (note: string) => {
        notes.push(note);
      },
      fees: {
        usd: { anchor: "0.1", network: "0.1", partnerMarkup: "0", total: "0.3", vortex: "0.1" }
      },
      now: new Date(),
      notes,
      partner: null,
      request: {
        from: EPaymentMethod.SEPA,
        inputAmount: "100",
        inputCurrency: FiatToken.EURC,
        network: Networks.Base,
        outputCurrency: EvmToken.MORPHO_VAULT,
        rampType: RampDirection.BUY,
        to: Networks.Arbitrum
      }
    };

    const output: PhaseIO = await eurOnrampMorphoFlow.simulate(ctx);

    expect(output.amount.gt(0)).toBe(true);
    expect(output.token).toBe(EvmToken.MORPHO_VAULT);
    expect(ctx.notes.length).toBeGreaterThan(0);
  });
});
