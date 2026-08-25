import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "../avenia-mint/execution";
import {
  type AveniaMintRegistrationFacts,
  type AveniaMintRegistrationInput,
  registerAveniaMint
} from "../avenia-mint/registration";
import { AveniaMintContext, simulateAveniaDirectMint } from "./simulation";
import { prepareAveniaDirectMintTxs } from "./transactions";

export const AveniaDirectMint: Phase<
  typeof AveniaMintContext,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>,
  AveniaMintRegistrationFacts,
  AveniaMintRegistrationInput
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  externalOperations: { register: { provider: "avenia" } },
  name: "AveniaDirectMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaDirectMintTxs,
  register: registerAveniaMint,
  simulate: simulateAveniaDirectMint
};
