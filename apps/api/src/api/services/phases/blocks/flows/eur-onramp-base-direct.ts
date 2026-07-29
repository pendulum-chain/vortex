import { EvmToken, FiatToken, Networks } from "@vortexfi/shared";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import { DestinationTransfer } from "../phases/destination-transfer";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { MykoboMint } from "../phases/mykobo-mint";

export const eurOnrampBaseDirectFlow = FlowBuilder.start(fiatRequestIO(FiatToken.EURC), MykoboMint)
  .pipe(FundEphemeral(EvmToken.EURC, Networks.Base))
  .pipe(DestinationTransfer<typeof EvmToken.EURC, typeof Networks.Base>())
  .build("EurOnrampBaseDirect", { isDirectTransfer: true });

export const eurOnrampBaseDirectPhaseFlow = assemblePhaseFlow(eurOnrampBaseDirectFlow);
