import type { Phase, PhaseIO } from "../../core/types";
import { MONERIUM_EURE, type MoneriumIssueNetwork } from "../monerium-issue/simulation";
import { MoneriumSelfTransferExecutor } from "./execution";
import { type MoneriumSelfTransferRegistrationFacts, registerMoneriumSelfTransfer } from "./registration";
import { MoneriumSelfTransferContext, simulateMoneriumSelfTransfer } from "./simulation";
import { prepareMoneriumSelfTransferTxs } from "./transactions";

export function MoneriumSelfTransfer<Network extends MoneriumIssueNetwork>(): Phase<
  typeof MoneriumSelfTransferContext,
  PhaseIO<typeof MONERIUM_EURE, Network>,
  PhaseIO<typeof MONERIUM_EURE, Network>,
  MoneriumSelfTransferRegistrationFacts
> {
  return {
    context: MoneriumSelfTransferContext,
    executors: [new MoneriumSelfTransferExecutor()],
    name: "MoneriumSelfTransfer",
    phases: ["moneriumOnrampSelfTransfer"],
    prepareTxs: prepareMoneriumSelfTransferTxs,
    register: registerMoneriumSelfTransfer,
    simulate: simulateMoneriumSelfTransfer
  };
}
