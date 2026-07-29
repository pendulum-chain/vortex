import { FiatToken, getPendulumDetails, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { SubsidizePreSwapExecutor } from "../subsidize-pre/execution";
import { computeExpectedOutput, SubsidizePreContext } from "../subsidize-pre/simulation";

export const PendulumSubsidizePre: Phase<
  typeof SubsidizePreContext,
  PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>,
  PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>
> = {
  context: SubsidizePreContext,
  executors: [new SubsidizePreSwapExecutor()],
  name: "PendulumSubsidizePre",
  phases: ["subsidizePreSwap"],
  async simulate(input, ctx) {
    const expected = await computeExpectedOutput(ctx);
    return {
      metadata: {
        expectedOutputAmountDecimal: expected.decimal,
        expectedOutputAmountRaw: expected.raw,
        inputCurrency: input.token,
        inputDecimals: getPendulumDetails(FiatToken.BRL).decimals,
        network: Networks.Pendulum,
        targetInputAmountRaw: input.amountRaw
      },
      output: input
    };
  }
};
