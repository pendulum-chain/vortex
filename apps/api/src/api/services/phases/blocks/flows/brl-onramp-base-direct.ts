import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import { AveniaDirectMint } from "../phases/avenia-direct-mint";
import { DestinationTransfer } from "../phases/destination-transfer";
import { FundEphemeral } from "../phases/fund-ephemeral";

export const brlOnrampBaseDirectFlow = FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaDirectMint)
  .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
  .pipe(DestinationTransfer<typeof EvmToken.BRLA, typeof Networks.Base>())
  .build("BrlOnrampBaseDirect", { isDirectTransfer: true });

export const brlOnrampBaseDirectPhaseFlow = assemblePhaseFlow(brlOnrampBaseDirectFlow);
