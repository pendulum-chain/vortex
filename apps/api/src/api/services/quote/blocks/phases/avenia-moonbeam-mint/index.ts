import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { calculateFees } from "../../core/fees";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "../avenia-mint/execution";
import { AveniaMintContext, simulateAveniaMint } from "../avenia-mint/simulation";
import {
  type AveniaMoonbeamRegistrationFacts,
  type AveniaMoonbeamRegistrationInput,
  registerAveniaMoonbeamMint
} from "./registration";
import { prepareAveniaMoonbeamMintTxs } from "./transactions";

export const AveniaMoonbeamMint: Phase<
  typeof AveniaMintContext,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Moonbeam>,
  AveniaMoonbeamRegistrationFacts,
  AveniaMoonbeamRegistrationInput
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  name: "AveniaMoonbeamMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaMoonbeamMintTxs,
  register: registerAveniaMoonbeamMint,
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
