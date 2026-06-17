import {describe, expect, it, mock} from "bun:test";
import {RampDirection} from "@vortexfi/shared";
import Big from "big.js";
import {QuoteContext} from "../../core/types";
import {OffRampMergeSubsidyEvmEngine} from "./offramp-evm";

function createContext(nablaSwapEvm: QuoteContext["nablaSwapEvm"]): QuoteContext {
  return {
    addNote: mock(() => undefined),
    nablaSwapEvm,
    request: {
      rampType: RampDirection.SELL
    },
    subsidy: {
      actualOutputAmountDecimal: new Big("100"),
      actualOutputAmountRaw: "100000000",
      adjustedDifference: new Big("0"),
      adjustedTargetDiscount: 0,
      expectedOutputAmountDecimal: new Big("110"),
      expectedOutputAmountRaw: "110000000",
      idealSubsidyAmountInOutputTokenDecimal: new Big("10"),
      idealSubsidyAmountInOutputTokenRaw: "10000000",
      partnerId: "partner-1",
      subsidyAmountInOutputTokenDecimal: new Big("10"),
      subsidyAmountInOutputTokenRaw: "10000000",
      subsidyRate: new Big("0.1"),
      targetOutputAmountDecimal: new Big("110"),
      targetOutputAmountRaw: "110000000"
    }
  } as unknown as QuoteContext;
}

describe("OffRampMergeSubsidyEvmEngine", () => {
  it("preserves AMM-only output before writing the merged subsidized output", async () => {
    const ctx = createContext({
      ammOutputAmountDecimal: new Big("100"),
      ammOutputAmountRaw: "100000000",
      inputAmountForSwapDecimal: "100",
      inputAmountForSwapRaw: "100000000",
      inputCurrency: "USDC",
      inputDecimals: 6,
      inputToken: "0xinput",
      outputAmountDecimal: new Big("100"),
      outputAmountRaw: "100000000",
      outputCurrency: "BRLA",
      outputDecimals: 6,
      outputToken: "0xoutput"
    } as QuoteContext["nablaSwapEvm"]);

    await new OffRampMergeSubsidyEvmEngine().execute(ctx);

    expect(ctx.nablaSwapEvm?.ammOutputAmountDecimal?.toFixed()).toBe("100");
    expect(ctx.nablaSwapEvm?.ammOutputAmountRaw).toBe("100000000");
    expect(ctx.nablaSwapEvm?.outputAmountDecimal.toFixed()).toBe("110");
    expect(ctx.nablaSwapEvm?.outputAmountRaw).toBe("110000000");
  });

  it("does not change the AMM-only output when subsidy is merged again", async () => {
    const ctx = createContext({
      ammOutputAmountDecimal: new Big("100"),
      ammOutputAmountRaw: "100000000",
      inputAmountForSwapDecimal: "100",
      inputAmountForSwapRaw: "100000000",
      inputCurrency: "USDC",
      inputDecimals: 6,
      inputToken: "0xinput",
      outputAmountDecimal: new Big("110"),
      outputAmountRaw: "110000000",
      outputCurrency: "BRLA",
      outputDecimals: 6,
      outputToken: "0xoutput"
    } as QuoteContext["nablaSwapEvm"]);

    await new OffRampMergeSubsidyEvmEngine().execute(ctx);

    expect(ctx.nablaSwapEvm?.ammOutputAmountDecimal?.toFixed()).toBe("100");
    expect(ctx.nablaSwapEvm?.ammOutputAmountRaw).toBe("100000000");
    expect(ctx.nablaSwapEvm?.outputAmountDecimal.toFixed()).toBe("120");
    expect(ctx.nablaSwapEvm?.outputAmountRaw).toBe("120000000");
  });
});
