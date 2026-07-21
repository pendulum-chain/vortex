import { ALFREDPAY_EVM_TOKEN, Networks } from "@vortexfi/shared";
import type { Phase, PhaseIO } from "../../core/types";
import { AlfredpayOnrampMintExecutor } from "./execution";
import { AlfredpayMintContext, type AlfredpayOnrampFiat, simulateAlfredpayMint } from "./simulation";
import { prepareAlfredpayMintTxs } from "./transactions";

export const AlfredpayMint: Phase<
  typeof AlfredpayMintContext,
  PhaseIO<AlfredpayOnrampFiat, "fiat">,
  PhaseIO<typeof ALFREDPAY_EVM_TOKEN, typeof Networks.Polygon>
> = {
  context: AlfredpayMintContext,
  executors: [new AlfredpayOnrampMintExecutor()],
  name: "AlfredpayMint",
  phases: ["alfredpayOnrampMint"],
  prepareTxs: prepareAlfredpayMintTxs,
  simulate: simulateAlfredpayMint
};
