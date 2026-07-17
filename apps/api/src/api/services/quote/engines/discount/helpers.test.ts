import { afterEach, describe, expect, it, spyOn } from "bun:test";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import { QuoteContext } from "../../core/types";
import { calculateExpectedOutput, calculateSubsidyAmount, getUsdDenominatedInputAmount } from "./helpers";

describe("calculateSubsidyAmount", () => {
  it("returns 0 when actual output meets expected output", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(100), 0);
    expect(result.toString()).toBe("0");
  });

  it("returns 0 when actual output exceeds expected output", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(110), 0);
    expect(result.toString()).toBe("0");
  });

  it("returns full shortfall when no maxSubsidy cap", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(90), 0);
    expect(result.toString()).toBe("10");
  });

  it("caps subsidy at maxSubsidy fraction of expected output", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(80), 0.05);
    // shortfall=20, maxAllowed=100*0.05=5
    expect(result.toString()).toBe("5");
  });

  it("returns full shortfall when it is less than maxSubsidy cap", () => {
    const result = calculateSubsidyAmount(new Big(100), new Big(95), 0.1);
    // shortfall=5, maxAllowed=100*0.1=10
    expect(result.toString()).toBe("5");
  });

});

// The negative-discount / rate-floor logic lives in calculateExpectedOutput, not
// calculateSubsidyAmount (which only sees the resulting expectedOutput).
describe("calculateExpectedOutput with negative targetDiscount (rate floor)", () => {
  it("lowers the expected output below the oracle rate for an onramp", () => {
    const { expectedOutput, adjustedTargetDiscount } = calculateExpectedOutput("100", new Big(1), -0.001, false, null);
    // rate = 1 * (1 - 0.001) = 0.999
    expect(expectedOutput.toString()).toBe("99.9");
    expect(adjustedTargetDiscount.toString()).toBe("-0.001");
  });

  it("inverts the oracle price for offramps before applying the discount", () => {
    const { expectedOutput } = calculateExpectedOutput("100", new Big(5), -0.01, true, null);
    // USD-FIAT rate = 1/5 = 0.2; discounted = 0.2 * 0.99 = 0.198
    expect(expectedOutput.toString()).toBe("19.8");
  });

  it("applies a positive targetDiscount as a rate premium", () => {
    const { expectedOutput } = calculateExpectedOutput("100", new Big(1), 0.02, false, null);
    expect(expectedOutput.toString()).toBe("102");
  });
});

describe("getUsdDenominatedInputAmount", () => {
  const brlToUsdRate = new Big("0.19475713784910216959");
  let rateSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    rateSpy?.mockRestore();
    rateSpy = undefined;
  });

  const makeCtx = (inputCurrency: string, inputAmount: string, bridgedUsdcAmount?: string) =>
    ({
      evmToEvm: bridgedUsdcAmount ? { outputAmountDecimal: new Big(bridgedUsdcAmount) } : undefined,
      request: { inputAmount, inputCurrency }
    }) as unknown as QuoteContext;

  it("returns the request amount unchanged for USD-like inputs", async () => {
    const usd = await getUsdDenominatedInputAmount(makeCtx("USDC", "1000"));
    expect(usd.toString()).toBe("1000");
  });

  it("values a BRLA input at the BRL-USD oracle rate", async () => {
    rateSpy = spyOn(priceFeedService, "getFiatToUsdExchangeRate").mockResolvedValue(brlToUsdRate);

    const usd = await getUsdDenominatedInputAmount(makeCtx("BRLA", "1000"));
    expect(usd.toFixed(6)).toBe("194.757138");
  });

  it("regression: a 1000 BRLA offramp to BRL targets ~1000 BRL, not inputAmount x inverted rate", async () => {
    rateSpy = spyOn(priceFeedService, "getFiatToUsdExchangeRate").mockResolvedValue(brlToUsdRate);

    // Before the fix the engine passed the raw 1000 (BRLA) into calculateExpectedOutput as if
    // it were USD, yielding an expected output of ~5134 BRL and a massively inflated subsidy.
    const usd = await getUsdDenominatedInputAmount(makeCtx("BRLA", "1000"));
    const { expectedOutput } = calculateExpectedOutput(usd.toString(), brlToUsdRate, 0, true, null);
    expect(expectedOutput.toFixed(4)).toBe("1000.0000");
  });

  it("falls back to the bridged USDC amount for tokens without a fiat peg", async () => {
    const usd = await getUsdDenominatedInputAmount(makeCtx("ETH", "0.5", "1834.201"));
    expect(usd.toString()).toBe("1834.201");
  });

  it("falls back to the request amount when no bridged amount is available", async () => {
    const usd = await getUsdDenominatedInputAmount(makeCtx("ETH", "0.5"));
    expect(usd.toString()).toBe("0.5");
  });
});
