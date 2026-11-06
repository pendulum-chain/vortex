import type { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { prepareAveniaDirectMintTxs } from "../avenia-direct-mint/transactions";
import { BrlaOnrampMintExecutor } from "../avenia-mint/execution";
import {
  type AveniaMintRegistrationFacts,
  type AveniaMintRegistrationInput,
  registerAveniaMint
} from "../avenia-mint/registration";
import { AveniaMintContext, simulateAveniaStockMint } from "./simulation";

export const AveniaStockMint: Phase<
  typeof AveniaMintContext,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>,
  AveniaMintRegistrationFacts,
  AveniaMintRegistrationInput
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  externalOperations: { register: { provider: "avenia" } },
  name: "AveniaStockMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaDirectMintTxs,
  register: registerAveniaMint,
  simulate: (input, ctx) => simulateAveniaStockMint(input, ctx)
};
