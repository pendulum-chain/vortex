import { AssetHubToken, Networks, PENDULUM_USDC_ASSETHUB } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { SubsidizePreSwapExecutor } from "../subsidize-pre/execution";
import { computeExpectedOutput, SubsidizePreContext } from "../subsidize-pre/simulation";

export const PendulumOfframpSubsidizePre: Phase<
  typeof SubsidizePreContext,
  PhaseIO<typeof AssetHubToken.USDC, typeof Networks.Pendulum>,
  PhaseIO<typeof AssetHubToken.USDC, typeof Networks.Pendulum>
> = {
  context: SubsidizePreContext,
  executors: [new SubsidizePreSwapExecutor()],
  name: "PendulumOfframpSubsidizePre",
  phases: ["subsidizePreSwap"],
  async simulate(input, ctx) {
    const expected = await computeExpectedOutput(ctx);
    return {
      metadata: {
        expectedOutputAmountDecimal: expected.decimal,
        expectedOutputAmountRaw: expected.raw,
        inputCurrency: AssetHubToken.USDC,
        inputCurrencyId: PENDULUM_USDC_ASSETHUB.currencyId,
        inputDecimals: PENDULUM_USDC_ASSETHUB.decimals,
        network: Networks.Pendulum,
        targetInputAmountRaw: input.amountRaw
      },
      output: input
    };
  }
};
