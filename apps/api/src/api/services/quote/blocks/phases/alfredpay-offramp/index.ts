import { type EvmNetworks, type EvmToken, type FiatToken } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import {
  AlfredpayOfframpFundExecutor,
  AlfredpayOfframpPermitExecutor,
  AlfredpayOfframpSettlementExecutor,
  AlfredpayOfframpTransferExecutor
} from "./execution";
import {
  type AlfredpayOfframpRegistrationFacts,
  type AlfredpayOfframpRegistrationInput,
  registerAlfredpayOfframp
} from "./registration";
import { AlfredpayOfframpContext, simulateAlfredpayOfframp } from "./simulation";
import { prepareAlfredpayOfframpTxs } from "./transactions";

export function AlfredpayOfframp<FromToken extends EvmToken, FromNetwork extends EvmNetworks>(
  fromToken: FromToken,
  fromNetwork: FromNetwork
): Phase<
  typeof AlfredpayOfframpContext,
  PhaseIO<FromToken, FromNetwork>,
  PhaseIO<FiatToken, "fiat">,
  AlfredpayOfframpRegistrationFacts,
  AlfredpayOfframpRegistrationInput
> {
  return {
    context: AlfredpayOfframpContext,
    executors: [
      new AlfredpayOfframpPermitExecutor(),
      new AlfredpayOfframpFundExecutor(),
      new AlfredpayOfframpSettlementExecutor(),
      new AlfredpayOfframpTransferExecutor()
    ],
    name: "AlfredpayOfframp",
    phases: ["squidRouterPermitExecute", "fundEphemeral", "finalSettlementSubsidy", "alfredpayOfframpTransfer"],
    prepareTxs: prepareAlfredpayOfframpTxs,
    register: registerAlfredpayOfframp,
    simulate: simulateAlfredpayOfframp(fromToken, fromNetwork)
  };
}
