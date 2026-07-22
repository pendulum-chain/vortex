import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { MykoboOnrampDepositExecutor } from "./execution";
import { type MykoboMintRegistrationFacts, type MykoboMintRegistrationInput, registerMykoboMint } from "./registration";
import { MykoboMintContext, simulateMykoboMint } from "./simulation";
import { prepareMykoboMintTxs } from "./transactions";

export const MykoboMint: Phase<
  typeof MykoboMintContext,
  PhaseIO<typeof FiatToken.EURC, "fiat">,
  PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>,
  MykoboMintRegistrationFacts,
  MykoboMintRegistrationInput
> = {
  context: MykoboMintContext,
  executors: [new MykoboOnrampDepositExecutor()],
  name: "MykoboMint",
  phases: ["mykoboOnrampDeposit"],
  prepareTxs: prepareMykoboMintTxs,
  register: registerMykoboMint,
  simulate: simulateMykoboMint
};
