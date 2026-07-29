import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { MykoboOfframpPayoutExecutor } from "./execution";
import {
  type MykoboOfframpPayoutRegistrationFacts,
  type MykoboOfframpPayoutRegistrationInput,
  registerMykoboOfframpPayout
} from "./registration";
import { MykoboOfframpPayoutContext, simulateMykoboOfframpPayout } from "./simulation";
import { prepareMykoboOfframpPayoutTxs } from "./transactions";

export const MykoboOfframpPayout: Phase<
  typeof MykoboOfframpPayoutContext,
  PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>,
  PhaseIO<typeof FiatToken.EURC, "fiat">,
  MykoboOfframpPayoutRegistrationFacts,
  MykoboOfframpPayoutRegistrationInput
> = {
  context: MykoboOfframpPayoutContext,
  executors: [new MykoboOfframpPayoutExecutor()],
  name: "MykoboOfframpPayout",
  phases: ["mykoboPayoutOnBase"],
  prepareTxs: prepareMykoboOfframpPayoutTxs,
  register: registerMykoboOfframpPayout,
  simulate: simulateMykoboOfframpPayout
};
