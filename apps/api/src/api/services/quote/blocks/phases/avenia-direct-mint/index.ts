import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { BrlaOnrampMintExecutor } from "../avenia-mint/execution";
import { AveniaMintContext, simulateAveniaDirectMint } from "./simulation";
import { prepareAveniaDirectMintTxs } from "./transactions";

export const AveniaDirectMint: Phase<
  typeof AveniaMintContext,
  PhaseIO<typeof FiatToken.BRL, "fiat">,
  PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  name: "AveniaDirectMint",
  phases: ["brlaOnrampMint"],
  prepareTxs: prepareAveniaDirectMintTxs,
  simulate: simulateAveniaDirectMint
};
