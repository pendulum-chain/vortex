import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "./execution";
import { simulateAveniaMint } from "./simulation";
import { prepareAveniaMintTxs } from "./transactions";

export const AveniaMint: Phase<PhaseIO<typeof FiatToken.BRL, "fiat">, PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>> = {
  executors: [new BrlaOnrampMintExecutor()],
  name: "AveniaMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaMintTxs,
  simulate: simulateAveniaMint
};
