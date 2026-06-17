import {describe, expect, it, mock} from "bun:test";
import Big from "big.js";
import type {QuoteContext} from "../../core/types";

const EvmToken = {
  BRLA: "BRLA",
  USDC: "USDC"
} as const;

const Networks = {
  Base: "base"
} as const;

const RampDirection = {
  BUY: "BUY",
  SELL: "SELL"
} as const;

mock.module("@vortexfi/shared", () => ({
  EvmToken,
  getOnChainTokenDetails: (_network: string, token: string) => ({
    assetSymbol: token,
    decimals: 6,
    erc20AddressSourceChain: token === EvmToken.USDC ? "0xusdc" : "0xbrla",
    isNative: false,
    network: Networks.Base,
    type: "evm"
  }),
  Networks,
  RampDirection
}));

mock.module("../../core/nabla", () => ({
  calculateNablaSwapOutputEvm: mock(async () => ({
    effectiveExchangeRate: "0.99",
    nablaOutputAmountDecimal: new Big("99"),
    nablaOutputAmountRaw: "99000000"
  }))
}));

mock.module("../../../priceFeed.service", () => ({
  priceFeedService: {
    getOnchainOraclePrice: mock(async () => ({ price: new Big("1") }))
  }
}));

mock.module("../../../../../config/logger", () => ({
  default: {
    warn: mock(() => undefined)
  }
}));

const {BaseNablaSwapEngineEvm} = await import("./base-evm");

class TestNablaSwapEngineEvm extends BaseNablaSwapEngineEvm {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "skip"
  } as const;

  protected validate(): void {}

  protected compute() {
    return {
      inputAmountPreFees: new Big("100"),
      inputToken: EvmToken.USDC,
      outputToken: EvmToken.BRLA
    };
  }
}

describe("BaseNablaSwapEngineEvm", () => {
  it("stores AMM-only output fields when assigning Nabla swap context", async () => {
    const ctx = {
      addNote: mock(() => undefined),
      request: {
        outputCurrency: "BRL",
        rampType: RampDirection.SELL
      }
    } as unknown as QuoteContext;

    await new TestNablaSwapEngineEvm().execute(ctx);

    expect(ctx.nablaSwapEvm?.ammOutputAmountDecimal?.toFixed()).toBe("99");
    expect(ctx.nablaSwapEvm?.ammOutputAmountRaw).toBe("99000000");
    expect(ctx.nablaSwapEvm?.outputAmountDecimal.toFixed()).toBe("99");
    expect(ctx.nablaSwapEvm?.outputAmountRaw).toBe("99000000");
  });
});
