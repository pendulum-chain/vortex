import { afterAll, describe, expect, it, mock } from "bun:test";
import {
  AssetHubToken,
  EPaymentMethod,
  FiatToken,
  getPendulumDetails,
  nativeToDecimal,
  Networks,
  PENDULUM_USDC_ASSETHUB,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import * as priceFeedNamespace from "../../../priceFeed.service";
import * as nablaNamespace from "../core/nabla";

const nablaReal = { ...nablaNamespace };
const priceFeedReal = { ...priceFeedNamespace };
const calculateNablaSwapOutput = mock(async () => ({
  effectiveExchangeRate: "5",
  nablaOutputAmountDecimal: new Big("1000"),
  nablaOutputAmountRaw: "1000000000"
}));

mock.module("../core/nabla", () => ({ ...nablaReal, calculateNablaSwapOutput }));
mock.module("../../../priceFeed.service", () => ({
  priceFeedService: { getFiatToUsdExchangeRate: async () => new Big("0.2") }
}));

const { PendulumNablaSwap } = await import("../phases/pendulum-nabla-swap");
const { PendulumOfframpNablaSwap } = await import("../phases/pendulum-offramp-nabla-swap");

afterAll(() => {
  mock.module("../core/nabla", () => ({ ...nablaReal }));
  mock.module("../../../priceFeed.service", () => ({ ...priceFeedReal }));
});

const ctx = {
  addNote() {},
  notes: [],
  now: new Date(),
  partner: null,
  request: {
    from: Networks.AssetHub,
    inputAmount: "5000",
    inputCurrency: FiatToken.BRL,
    network: Networks.AssetHub,
    outputCurrency: FiatToken.BRL,
    rampType: RampDirection.SELL,
    to: EPaymentMethod.PIX
  }
} as never;

describe("Pendulum Nabla swap amount simulation", () => {
  it("onramp block derives the swap decimal from the carried raw, not the higher-precision input decimal", async () => {
    const decimals = getPendulumDetails(FiatToken.BRL).decimals;
    const amountRaw = "4977578489123456";
    const expectedDecimal = nativeToDecimal(amountRaw, decimals).toString();

    const result = await PendulumNablaSwap.simulate(
      {
        amount: new Big(expectedDecimal).plus("1e-11"),
        amountRaw,
        chain: Networks.Pendulum,
        token: FiatToken.BRL
      },
      ctx
    );

    expect(calculateNablaSwapOutput).toHaveBeenCalledWith(expect.objectContaining({ inputAmountForSwap: expectedDecimal }));
    expect(result.metadata.inputAmountForSwapDecimal).toBe(expectedDecimal);
    expect(result.metadata.inputAmountForSwapRaw).toBe(amountRaw);
  });

  it("offramp block derives the swap decimal from the carried raw, not the higher-precision input decimal", async () => {
    const decimals = PENDULUM_USDC_ASSETHUB.decimals;
    const amountRaw = "4977578489";
    const expectedDecimal = nativeToDecimal(amountRaw, decimals).toString();

    const result = await PendulumOfframpNablaSwap.simulate(
      {
        amount: new Big(expectedDecimal).plus("1e-8"),
        amountRaw,
        chain: Networks.Pendulum,
        token: AssetHubToken.USDC
      },
      ctx
    );

    expect(calculateNablaSwapOutput).toHaveBeenCalledWith(expect.objectContaining({ inputAmountForSwap: expectedDecimal }));
    expect(result.metadata.inputAmountForSwapDecimal).toBe(expectedDecimal);
    expect(result.metadata.inputAmountForSwapRaw).toBe(amountRaw);
  });
});
