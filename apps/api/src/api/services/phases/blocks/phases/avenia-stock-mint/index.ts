import type { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "../avenia-mint/execution";
import {
  type AveniaMintRegistrationFacts,
  type AveniaMintRegistrationInput,
  registerAveniaMint
} from "../avenia-mint/registration";
import { prepareAveniaMintTxs } from "../avenia-mint/transactions";
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
  // The BRLA is minted onto the ephemeral, so the order signs the BRL onramp's BRLA cleanup approval.
  prepareTxs: prepareAveniaMintTxs,
  register: registerAveniaMint,
  simulate: (input, ctx) => simulateAveniaStockMint(input, ctx)
};
