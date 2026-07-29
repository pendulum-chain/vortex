import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { AveniaOfframpPayoutExecutor } from "./execution";
import {
  type AveniaOfframpPayoutRegistrationFacts,
  type AveniaOfframpPayoutRegistrationInput,
  registerAveniaOfframpPayout
} from "./registration";
import { AveniaOfframpPayoutContext, simulateAveniaOfframpPayout } from "./simulation";
import { prepareAveniaOfframpPayoutTxs } from "./transactions";

export const AveniaOfframpPayout: Phase<
  typeof AveniaOfframpPayoutContext,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  AveniaOfframpPayoutRegistrationFacts,
  AveniaOfframpPayoutRegistrationInput
> = {
  context: AveniaOfframpPayoutContext,
  executors: [new AveniaOfframpPayoutExecutor()],
  name: "AveniaOfframpPayout",
  phases: ["brlaPayoutOnBase"],
  prepareTxs: prepareAveniaOfframpPayoutTxs,
  register: registerAveniaOfframpPayout,
  simulate: simulateAveniaOfframpPayout
};
