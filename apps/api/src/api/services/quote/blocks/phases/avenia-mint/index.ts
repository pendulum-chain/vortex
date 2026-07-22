import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { overrideFees } from "../../core/fees";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "./execution";
import { AveniaMintContext, simulateAveniaMint } from "./simulation";
import { prepareAveniaMintTxs } from "./transactions";

export const AveniaMint: Phase<
  typeof AveniaMintContext,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  name: "AveniaMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaMintTxs,
  async simulate(input, ctx) {
    const result = await simulateAveniaMint(input, ctx);
    return {
      ...result,
      fees: await overrideFees(ctx, {
        anchor: {
          amount: new Big(result.metadata.mint.fee).plus(result.metadata.transfer.fee).toString(),
          currency: FiatToken.BRL
        }
      })
    };
  }
};
