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
import { assemblePhaseFlow } from "../core/phase-flow";
import type { PhaseCtx, PhaseIO } from "../core/types";
import type { SubsidyMeta } from "../phases/subsidize-pre";
import { MorphoMint } from "../phases/morpho-mint";
import { MykoboMint } from "../phases/mykobo-mint";
import {
  eurOnrampBaseMorphoFlow,
  eurOnrampBaseMorphoPhaseFlow,
  eurOnrampMorphoFlow,
  eurOnrampMorphoPhaseFlow
} from "../flows/eur-onramp-morpho";

describe("EUR_ONRAMP_MORPHO block flow — structure", () => {
  it("derives the core phases from the cross-chain assembled blocks", () => {
    expect(eurOnrampMorphoFlow.phases).toEqual([
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
      "morphoDeposit"
    ]);
  });

  it("derives the core phases from the base-vault assembled blocks", () => {
    expect(eurOnrampBaseMorphoFlow.phases).toEqual([
      "mykoboOnrampDeposit",
      "fundEphemeral",
      "subsidizePreSwap",
      "nablaApprove",
      "nablaSwap",
      "distributeFees",
      "subsidizePostSwap",
      "morphoDeposit"
    ]);
  });

  it("assembles the cross-chain phaseFlow matching the existing EUR_ONRAMP_MORPHO", () => {
    expect(eurOnrampMorphoPhaseFlow).toEqual(EUR_ONRAMP_MORPHO);
    expect(assemblePhaseFlow(eurOnrampMorphoFlow)).toEqual(EUR_ONRAMP_MORPHO);
  });

  it("assembles the base-vault phaseFlow matching the existing EUR_ONRAMP_BASE_MORPHO", () => {
    expect(eurOnrampBaseMorphoPhaseFlow).toEqual(EUR_ONRAMP_BASE_MORPHO);
    expect(assemblePhaseFlow(eurOnrampBaseMorphoFlow)).toEqual(EUR_ONRAMP_BASE_MORPHO);
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
      from: EPaymentMethod.SEPA,
      inputAmount: "100",
      inputCurrency: FiatToken.EURC,
      network: Networks.Base,
      outputCurrency: EvmToken.MORPHO_VAULT,
      rampType: RampDirection.BUY,
      to: Networks.Arbitrum
    }
  };
}

async function runFlow(flow: typeof eurOnrampMorphoFlow, to: Networks.Base | Networks.Arbitrum): Promise<PhaseIO> {
  MykoboApiService.getInstance = mock(() => ({
    defaultDepositFee: mock(async () => ({ total: "0.5" }))
  })) as unknown as typeof MykoboApiService.getInstance;

  EvmClientManager.getInstance = mock(() => ({
    getClient: mock(() => ({
      readContract: mock(async () => 1000000000000000000n)
    }))
  })) as unknown as typeof EvmClientManager.getInstance;

  const ctx: PhaseCtx = { ...buildCtx(), request: { ...buildCtx().request, to } };
  return flow.simulate(ctx);
}

describe("EUR_ONRAMP_MORPHO block flow — simulate smoke", () => {
  it("runs the cross-chain flow end-to-end and lands on MORPHO_VAULT", async () => {
    const output: PhaseIO = await runFlow(eurOnrampMorphoFlow, Networks.Arbitrum);
    expect(output.amount.gt(0)).toBe(true);
    expect(output.token).toBe(EvmToken.MORPHO_VAULT);
  });

  it("runs the base-vault flow end-to-end and lands on MORPHO_VAULT", async () => {
    const output: PhaseIO = await runFlow(eurOnrampBaseMorphoFlow, Networks.Base);
    expect(output.amount.gt(0)).toBe(true);
    expect(output.token).toBe(EvmToken.MORPHO_VAULT);
  });
});

describe("EUR_ONRAMP_MORPHO block flow — metadata parity", () => {
  it("accumulates mykoboMint, nablaSwapEvm, fees, subsidy, morphoDeposit in the cross-chain flow meta", async () => {
    const output: PhaseIO = await runFlow(eurOnrampMorphoFlow, Networks.Arbitrum);
    const { meta } = output;

    expect(meta.fees).toBeDefined();
    expect((meta.fees as { usd: { total: string } }).usd.total).toBe("0.3");

    const mykobo = meta.mykoboMint as {
      currency: FiatToken;
      fee: Big;
      inputAmountDecimal: Big;
      inputAmountRaw: string;
      outputAmountDecimal: Big;
      outputAmountRaw: string;
    };
    expect(mykobo).toBeDefined();
    expect(mykobo.currency).toBe(FiatToken.EURC);
    expect(mykobo.fee.toFixed()).toBe("0.5");
    expect(mykobo.inputAmountRaw).toBe("100");
    expect(mykobo.outputAmountRaw).toBe("99500000");

    const nabla = meta.nablaSwapEvm as {
      inputAmountForSwapRaw: string;
      inputDecimals: number;
      inputToken: string;
      outputAmountRaw: string;
      outputDecimals: number;
      outputToken: string;
      effectiveExchangeRate?: string;
    };
    expect(nabla).toBeDefined();
    expect(nabla.inputAmountForSwapRaw).toBe("99500000");
    expect(nabla.outputAmountRaw).toBe("105000000");
    expect(nabla.effectiveExchangeRate).toBe("1.05");

    const evmToEvm = meta.evmToEvm as {
      effectiveExchangeRate: string;
      fromNetwork: string;
      fromToken: string;
      inputAmountRaw: string;
      outputAmountRaw: string;
      toNetwork: string;
      toToken: string;
      networkFeeUSD: string;
    };
    expect(evmToEvm).toBeDefined();
    expect(evmToEvm.fromNetwork).toBe(Networks.Base);
    expect(evmToEvm.toNetwork).toBe(Networks.Arbitrum);
    expect(evmToEvm.inputAmountRaw).toBeDefined();
    expect(evmToEvm.outputAmountRaw).toBe("95000000");
    expect(evmToEvm.networkFeeUSD).toBe("0.1");

    const subsidy = meta.subsidy as SubsidyMeta;
    expect(subsidy).toBeDefined();
    expect(subsidy.applied).toBe(false);
    expect(subsidy.expectedOutputAmountDecimal.toFixed()).toBe("100");
    expect(subsidy.actualOutputAmountDecimal.gt(0)).toBe(true);
    expect(subsidy.partnerId).toBeNull();
    expect(subsidy.adjustedDifference).toBeDefined();
    expect(subsidy.adjustedTargetDiscount).toBeDefined();

    const morpho = meta.morphoDeposit as {
      depositAssetAddress: string;
      expectedUsdcRaw: string;
      sharesAmountRaw: string;
      vaultAddress: string;
    };
    expect(morpho).toBeDefined();
    expect(morpho.vaultAddress).toBeDefined();
    expect(morpho.depositAssetAddress).toBeDefined();
    expect(morpho.expectedUsdcRaw).toBe("95000000");
    expect(morpho.sharesAmountRaw).toBe("1000000000000000000");
  });

  it("omits evmToEvm in the base-vault flow meta but keeps all other keys", async () => {
    const output: PhaseIO = await runFlow(eurOnrampBaseMorphoFlow, Networks.Base);
    const { meta } = output;

    expect(meta.mykoboMint).toBeDefined();
    expect(meta.nablaSwapEvm).toBeDefined();
    expect(meta.fees).toBeDefined();
    expect(meta.subsidy).toBeDefined();
    expect(meta.morphoDeposit).toBeDefined();
    expect(meta.evmToEvm).toBeUndefined();
  });
});
