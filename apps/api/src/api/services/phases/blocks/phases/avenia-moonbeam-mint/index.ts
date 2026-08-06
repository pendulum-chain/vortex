import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { calculateFees } from "../../core/fees";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "../avenia-mint/execution";
import {
  type AveniaMintRegistrationFacts,
  type AveniaMintRegistrationInput,
  registerAveniaMint
} from "../avenia-mint/registration";
import { AveniaMintContext, simulateAveniaMint } from "../avenia-mint/simulation";
import { prepareAveniaMoonbeamMintTxs } from "./transactions";

export const AveniaMoonbeamMint: Phase<
  typeof AveniaMintContext,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Moonbeam>,
  AveniaMintRegistrationFacts,
  AveniaMintRegistrationInput
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  externalOperations: { register: { provider: "avenia" } },
  name: "AveniaMoonbeamMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaMoonbeamMintTxs,
  register: registerAveniaMint,
  async simulate(input, ctx) {
    const result = await simulateAveniaMint(input, ctx);
    return {
      ...result,
      fees: await calculateFees(ctx, {
        anchor: {
          amount: new Big(result.metadata.mint.fee).plus(result.metadata.transfer.fee).toString(),
          currency: FiatToken.BRL
        },
        network: { amount: "0.03", currency: EvmToken.USDC }
      }),
      metadata: { ...result.metadata, network: Networks.Moonbeam },
      output: { ...result.output, chain: Networks.Moonbeam }
    };
  }
};
