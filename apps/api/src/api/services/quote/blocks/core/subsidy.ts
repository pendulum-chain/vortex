import { RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../priceFeed.service";
import type { Phase, PhaseCtx, PhaseIO } from "./types";

interface SubsidyMeta {
  applied: boolean;
  subsidyRate: Big;
  partnerId: string | null;
  expectedOutputAmountDecimal: Big;
  expectedOutputAmountRaw: string;
  actualOutputAmountDecimal: Big;
  actualOutputAmountRaw: string;
  subsidyAmountInOutputTokenDecimal: Big;
  subsidyAmountInOutputTokenRaw: string;
  idealSubsidyAmountInOutputTokenDecimal: Big;
  idealSubsidyAmountInOutputTokenRaw: string;
  targetOutputAmountDecimal: Big;
  targetOutputAmountRaw: string;
}

export function WithSubsidy<P extends Phase<I, O>, I extends PhaseIO, O extends PhaseIO>(
  inner: P,
  opts: { bookend: "subsidizePostSwap" | "finalSettlementSubsidy" }
): Phase<I, O> {
  return {
    name: `WithSubsidy(${inner.name})`,
    phases: ["subsidizePreSwap", ...inner.phases, opts.bookend],
    async simulate(input: I, ctx: PhaseCtx): Promise<O> {
      const output = await inner.simulate(input, ctx);
      const subsidy = await computeSubsidyMeta(output, ctx);
      return { ...output, meta: { ...output.meta, subsidy } } as O;
    }
  };
}

async function computeSubsidyMeta(output: PhaseIO, ctx: PhaseCtx): Promise<SubsidyMeta> {
  const partner = ctx.partner;
  const targetDiscount = partner?.targetDiscount ?? 0;
  const maxSubsidy = partner?.maxSubsidy ?? 0;
  const isOfframp = ctx.request.rampType === RampDirection.SELL;

  let expectedOutputAmountDecimal = output.amount;
  try {
    const oracle = await priceFeedService.getOnchainOraclePrice(ctx.request.inputCurrency);
    const effectivePrice = isOfframp ? new Big(1).div(oracle.price) : oracle.price;
    const discountedRate = effectivePrice.mul(new Big(1).plus(targetDiscount));
    expectedOutputAmountDecimal = new Big(ctx.request.inputAmount).mul(discountedRate);
  } catch (error) {
    ctx.addNote(`WithSubsidy: oracle price unavailable, falling back to actual output as expected. Error: ${error}`);
  }

  const actualOutputAmountDecimal = output.amount;
  const idealSubsidyAmountInOutputTokenDecimal = actualOutputAmountDecimal.gte(expectedOutputAmountDecimal)
    ? new Big(0)
    : expectedOutputAmountDecimal.minus(actualOutputAmountDecimal);

  const subsidyAmountInOutputTokenDecimal =
    targetDiscount !== 0
      ? capSubsidy(idealSubsidyAmountInOutputTokenDecimal, expectedOutputAmountDecimal, maxSubsidy)
      : new Big(0);

  const targetOutputAmountDecimal = actualOutputAmountDecimal.plus(subsidyAmountInOutputTokenDecimal);
  const subsidyRate = expectedOutputAmountDecimal.gt(0)
    ? subsidyAmountInOutputTokenDecimal.div(expectedOutputAmountDecimal)
    : new Big(0);

  const toRaw = (decimal: Big): string =>
    output.amount.gt(0) ? new Big(output.amountRaw).times(decimal).div(output.amount).toFixed(0, 0) : "0";

  return {
    actualOutputAmountDecimal,
    actualOutputAmountRaw: output.amountRaw,
    applied: subsidyAmountInOutputTokenDecimal.gt(0),
    expectedOutputAmountDecimal,
    expectedOutputAmountRaw: toRaw(expectedOutputAmountDecimal),
    idealSubsidyAmountInOutputTokenDecimal,
    idealSubsidyAmountInOutputTokenRaw: toRaw(idealSubsidyAmountInOutputTokenDecimal),
    partnerId: partner?.id ?? null,
    subsidyAmountInOutputTokenDecimal,
    subsidyAmountInOutputTokenRaw: toRaw(subsidyAmountInOutputTokenDecimal),
    subsidyRate,
    targetOutputAmountDecimal,
    targetOutputAmountRaw: toRaw(targetOutputAmountDecimal)
  };
}

function capSubsidy(idealSubsidy: Big, expectedOutput: Big, maxSubsidy: number): Big {
  if (maxSubsidy > 0) {
    const maxAllowed = expectedOutput.mul(maxSubsidy);
    return idealSubsidy.gt(maxAllowed) ? maxAllowed : idealSubsidy;
  }
  return idealSubsidy;
}
