import { EvmToken, Networks, PENDULUM_USDC_ASSETHUB } from "@vortexfi/shared";
import Big from "big.js";
import type { Phase, PhaseIO } from "../../core/types";
import { SubsidizePostSwapExecutor } from "../subsidize-post/execution";
import { SubsidizePostContext } from "../subsidize-post/simulation";
import { buildFullSubsidy, computeExpectedOutput } from "../subsidize-pre/simulation";

export const PendulumSubsidizePost: Phase<
  typeof SubsidizePostContext,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Pendulum>,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Pendulum>
> = {
  context: SubsidizePostContext,
  executors: [new SubsidizePostSwapExecutor()],
  name: "PendulumSubsidizePost",
  phases: ["subsidizePostSwap"],
  async simulate(input, ctx) {
    const expected = await computeExpectedOutput(ctx);
    const subsidy = buildFullSubsidy(input.amount, input.amountRaw, expected.decimal, expected.raw, ctx);
    const amount = input.amount.plus(subsidy.subsidyAmountInOutputTokenDecimal);
    const amountRaw = new Big(input.amountRaw).plus(subsidy.subsidyAmountInOutputTokenRaw).toFixed(0, 0);
    return {
      metadata: {
        ...subsidy,
        network: Networks.Pendulum,
        outputCurrency: EvmToken.USDC,
        outputCurrencyId: PENDULUM_USDC_ASSETHUB.currencyId,
        outputDecimals: PENDULUM_USDC_ASSETHUB.decimals
      },
      output: { ...input, amount, amountRaw }
    };
  }
};
