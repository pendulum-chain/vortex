import {afterAll, describe, expect, it, mock} from "bun:test";
import Big from "big.js";
// Captured before mock.module so afterAll can restore the real modules —
// bun module mocks are process-wide and would poison later test files.
import * as sharedNamespace from "@vortexfi/shared";
import * as nablaNamespace from "../../core/nabla";
import * as priceFeedNamespace from "../../../priceFeed.service";
import * as loggerNamespace from "../../../../../config/logger";
import type {QuoteContext} from "../../core/types";

// Value copies taken before mock.module runs — the namespaces themselves are
// live bindings that would reflect the mocks once installed.
const sharedReal = { ...sharedNamespace };
const nablaReal = { ...nablaNamespace };
const priceFeedReal = { ...priceFeedNamespace };
const loggerReal = { ...loggerNamespace };

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../core/nabla", () => ({ ...nablaReal }));
  mock.module("../../../priceFeed.service", () => ({ ...priceFeedReal }));
  mock.module("../../../../../config/logger", () => ({ ...loggerReal }));
});

const mockedEvmToken = {
  BRLA: "BRLA",
  USDC: "USDC"
} as const;

const mockedNetworks = {
  Base: "base"
} as const;

const mockedRampDirection = {
  BUY: "BUY",
  SELL: "SELL"
} as const;

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  EvmToken: mockedEvmToken,
  getOnChainTokenDetails: (_network: string, token: string) => ({
    assetSymbol: token,
    decimals: 6,
    erc20AddressSourceChain: token === mockedEvmToken.USDC ? "0xusdc" : "0xbrla",
    isNative: false,
    network: mockedNetworks.Base,
    type: "evm"
  }),
  Networks: mockedNetworks,
  RampDirection: mockedRampDirection
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

const {EvmToken, RampDirection} = await import("@vortexfi/shared");
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
