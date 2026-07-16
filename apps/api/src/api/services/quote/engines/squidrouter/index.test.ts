import {afterAll, describe, expect, it, mock} from "bun:test";
import {EvmToken, Networks, RampDirection} from "@vortexfi/shared";
import Big from "big.js";
import {QuoteContext} from "../../core/types";

const BSC_USDT_OUTPUT_RAW = "4817805726163073314321";

import * as coreSquidrouterNamespace from "../../core/squidrouter";

// Value copy taken before mock.module runs; restored in afterAll because bun
// module mocks are process-wide.
const coreSquidrouterReal = { ...coreSquidrouterNamespace };

afterAll(() => {
  mock.module("../../core/squidrouter", () => ({ ...coreSquidrouterReal }));
});

mock.module("../../core/squidrouter", () => ({
  ...coreSquidrouterReal,
  calculateEvmBridgeAndNetworkFee: mock(async () => ({
    finalEffectiveExchangeRate: "1",
    finalGrossOutputAmountDecimal: new Big("4817.805726163073314321"),
    finalGrossOutputAmountRaw: BSC_USDT_OUTPUT_RAW,
    networkFeeUSD: "0.061741",
    outputTokenDecimals: 18
  }))
}));

const { BaseSquidRouterEngine } = await import("./index");

class TestSquidRouterEngine extends BaseSquidRouterEngine {
  readonly config = {
    direction: RampDirection.BUY,
    skipNote: "skip"
  } as const;

  protected validate(): void {}

  protected compute() {
    return {
      data: {
        amountRaw: "4817744605",
        fromNetwork: Networks.Base,
        fromToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
        inputAmountDecimal: new Big("4817.744605"),
        inputAmountRaw: "4817744605",
        outputDecimals: 6,
        toNetwork: Networks.BSC,
        toToken: "0x55d398326f99059fF775485246999027B3197955" as const
      },
      type: "evm-to-evm" as const
    };
  }
}

describe("BaseSquidRouterEngine", () => {
  it("stores Squid destination raw output instead of rebuilding it with source decimals", async () => {
    const ctx = {
      addNote: mock(() => undefined),
      request: {
        outputCurrency: EvmToken.USDT,
        rampType: RampDirection.BUY
      }
    } as unknown as QuoteContext;

    await new TestSquidRouterEngine().execute(ctx);

    expect(ctx.evmToEvm?.outputAmountDecimal.toFixed()).toBe("4817.805726163073314321");
    expect(ctx.evmToEvm?.outputAmountRaw).toBe(BSC_USDT_OUTPUT_RAW);
  });
});
