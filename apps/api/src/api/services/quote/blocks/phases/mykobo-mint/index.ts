import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { MykoboMintContext, simulateMykoboMint } from "./simulation";

export const MykoboMint: Phase<
  typeof MykoboMintContext,
  PhaseIO<typeof FiatToken.EURC, "fiat">,
  PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>
> = {
  context: MykoboMintContext,
  name: "MykoboMint",
  phases: ["mykoboOnrampDeposit"],
  simulate: simulateMykoboMint
};
