import { FiatToken } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { MoneriumOnrampMintExecutor } from "./execution";
import {
  type MoneriumIssueRegistrationFacts,
  type MoneriumIssueRegistrationInput,
  registerMoneriumIssue
} from "./registration";
import { MONERIUM_EURE, MoneriumIssueContext, type MoneriumIssueNetwork, simulateMoneriumIssue } from "./simulation";
import { prepareMoneriumIssueTxs } from "./transactions";

export function MoneriumIssue<Network extends MoneriumIssueNetwork>(
  network: Network,
  issueFee: string
): Phase<
  typeof MoneriumIssueContext,
  PhaseIO<typeof FiatToken.EURC, "fiat">,
  PhaseIO<typeof MONERIUM_EURE, Network>,
  MoneriumIssueRegistrationFacts,
  MoneriumIssueRegistrationInput
> {
  return {
    context: MoneriumIssueContext,
    executors: [new MoneriumOnrampMintExecutor()],
    name: "MoneriumIssue",
    phases: ["moneriumOnrampMint"],
    prepareTxs: prepareMoneriumIssueTxs,
    register: registerMoneriumIssue,
    simulate: (input, ctx) => simulateMoneriumIssue(input, ctx, network, issueFee)
  };
}
