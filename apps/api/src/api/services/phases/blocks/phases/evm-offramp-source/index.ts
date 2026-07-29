import { type EvmNetworks, EvmToken, Networks, type OnChainToken } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { FundEphemeralExecutor } from "../fund-ephemeral/execution";
import {
  type EvmOfframpSourceRegistrationFacts,
  type EvmOfframpSourceRegistrationInput,
  registerEvmOfframpSource
} from "./registration";
import { EvmOfframpSourceContext, simulateEvmOfframpSource } from "./simulation";
import { prepareEvmOfframpSourceTxs } from "./transactions";

export function EvmOfframpSource<FromToken extends OnChainToken, FromNetwork extends EvmNetworks>(): Phase<
  typeof EvmOfframpSourceContext,
  PhaseIO<FromToken, FromNetwork>,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Base>,
  EvmOfframpSourceRegistrationFacts,
  EvmOfframpSourceRegistrationInput
> {
  return {
    context: EvmOfframpSourceContext,
    executors: [new FundEphemeralExecutor()],
    name: "EvmOfframpSource",
    phases: ["fundEphemeral"],
    prepareTxs: prepareEvmOfframpSourceTxs,
    register: registerEvmOfframpSource,
    simulate: simulateEvmOfframpSource
  };
}
