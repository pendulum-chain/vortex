import { FiatToken, getPendulumDetails, multiplyByPowerOfTen, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import { calculateExpectedOutput, calculateSubsidyAmount, resolveDiscountPartner } from "../../../engines/discount/helpers";
import type { Phase, PhaseIO } from "../../core/types";
import { SubsidizePostSwapExecutor } from "../subsidize-post/execution";
import { SubsidizePostContext } from "../subsidize-post/simulation";

export const PendulumOfframpSubsidizePost: Phase<
  typeof SubsidizePostContext,
  PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>,
  PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>
> = {
  context: SubsidizePostContext,
  executors: [new SubsidizePostSwapExecutor()],
  name: "PendulumOfframpSubsidizePost",
  phases: ["subsidizePostSwap"],
  async simulate(input, ctx) {
    const details = getPendulumDetails(FiatToken.BRL);
    const partner = await resolveDiscountPartner(ctx as never, ctx.request.rampType);
    const oraclePrice = await priceFeedService.getFiatToUsdExchangeRate(FiatToken.BRL);
    const expected = calculateExpectedOutput(ctx.request.inputAmount, oraclePrice, partner?.targetDiscount ?? 0, true, partner);
    const expectedWithAnchor = expected.expectedOutput.plus(ctx.fees?.displayFiat?.anchor ?? 0);
    const subsidyUnrounded =
      (partner?.targetDiscount ?? 0) !== 0
        ? calculateSubsidyAmount(expectedWithAnchor, input.amount, partner?.maxSubsidy ?? 0)
        : new Big(0);
    const subsidy = new Big(subsidyUnrounded.toFixed(6, 0));
    const subsidyRaw = multiplyByPowerOfTen(subsidyUnrounded, details.decimals).toFixed(0, 0);
    const target = input.amount.plus(subsidy);
    const targetRaw = new Big(input.amountRaw).plus(subsidyRaw).toFixed(0, 0);
    const ideal = input.amount.gte(expectedWithAnchor) ? new Big(0) : expectedWithAnchor.minus(input.amount);
    return {
      metadata: {
        actualOutputAmountDecimal: input.amount,
        actualOutputAmountRaw: input.amountRaw,
        adjustedDifference: expected.adjustedDifference,
        adjustedTargetDiscount: expected.adjustedTargetDiscount,
        applied: subsidy.gt(0),
        expectedOutputAmountDecimal: expectedWithAnchor,
        expectedOutputAmountRaw: multiplyByPowerOfTen(expectedWithAnchor, details.decimals).toFixed(0, 0),
        idealSubsidyAmountInOutputTokenDecimal: ideal,
        idealSubsidyAmountInOutputTokenRaw: multiplyByPowerOfTen(ideal, details.decimals).toFixed(0, 0),
        network: Networks.Pendulum,
        outputCurrency: FiatToken.BRL,
        outputCurrencyId: details.currencyId,
        outputDecimals: details.decimals,
        partnerId: partner?.id ?? null,
        subsidyAmountInOutputTokenDecimal: subsidy,
        subsidyAmountInOutputTokenRaw: subsidyRaw,
        subsidyRate: expectedWithAnchor.gt(0) ? subsidyUnrounded.div(expectedWithAnchor) : new Big(0),
        targetOutputAmountDecimal: target,
        targetOutputAmountRaw: targetRaw
      },
      output: { ...input, amount: target, amountRaw: targetRaw }
    };
  }
};
