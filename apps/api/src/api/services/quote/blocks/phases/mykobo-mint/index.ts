import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { simulateMykoboMint } from "./simulation";

export const MykoboMint: Phase<PhaseIO<typeof FiatToken.EURC, "fiat">, PhaseIO<typeof EvmToken.EURC, typeof Networks.Base>> = {
  name: "MykoboMint",
  phases: ["mykoboOnrampDeposit"],
  simulate: simulateMykoboMint
};
